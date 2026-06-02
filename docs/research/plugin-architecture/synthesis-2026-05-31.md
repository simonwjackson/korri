# Korri Plugin Architecture — Research Synthesis

> Gaming stays first-class. Plugins extend, never dilute.
> Synthesis of four parallel research streams: codebase scan, industry prior art, Effect-TS idioms, gaming-first hazards.
> Date: 2026-05-31. Branch: trunk.

---

## TL;DR (read this first)

1. **You already have a plugin system. You just don't know it.** Effect `Context.Service` + `Layer` swaps + `layerAtom` overrides ARE the plugin DI mechanism. `librarySourceLayerAtom`, `launcherLayerAtom`, `foregroundSessionStatusLayerAtom` are plugin sockets. The gap is **type lock-in**, not architecture.

2. **The single deepest crack to widen is `korri/shared/library/library-services.ts`.** Generalize `LibrarySource → ContentSource` (returns a tagged sum: `GameItem | MediaItem | TrackItem | …`) and `Launcher → ActionRunner` (runs an `Intent`, not just a `LaunchSpec`). That one file is where "gaming" is structurally welded to the contract. Crack it correctly and Jellyfin/Bixis/user-plugins fall out as Layer implementations.

3. **The closest prior art is Playnite, not VSCode.** Three plugin types — `LibrarySourcePlugin` (contributes items), `MetadataPlugin` (enriches items), `GenericPlugin` (everything else: actions, panels, hooks). These map 1:1 to Effect Service shapes. Steal this taxonomy directly.

4. **The home screen is not a plugin slot.** Like Steam Deck's QAM, plugins get secondary surfaces. The Shift theme keeps owning presentation; plugins contribute data + actions, never DOM or styling. The moment a plugin can `style={{...}}` the home grid, gaming-first is dead.

5. **The trust gradient — not the technical isolation — is what makes "just-for-me → first-class" possible.** Three tiers: in-tree (`korri/plugins/<id>`), community (sideloaded with manifest), user (`~/.config/korri/plugins/<id>`). All three use the same Layer contract. Only the *discovery path* and *capability grants* differ.

6. **A new top-level alias: `@plugins/*`.** Don't bury plugins under `@app/*` or pretend they're `@shared/*`. They are siblings of `products/app`, each a product of the same contract.

7. **NixOS: per-plugin modules under `services.korri.plugins.<id>`.** Matches the existing per-concern module pattern. Plugin = optional package + optional systemd unit + optional sessiond allowlist entry.

8. **First move:** a single PR generalizing `library-services.ts` while keeping `LibrarySource` as an alias for `ContentSource`-where-`kind="game"`. Zero behavior change. Sets up everything else.

---

## Layer 1 — The shape of the answer

Four streams agree on the same answer, from different angles:

- **Codebase**: Effect Layers are the DI seam. The lock-in is in the *types*, not the architecture.
- **Industry**: Playnite, Jellyfin, VSCode, Decky Loader all converge on "core knows about plugin *contracts*, not plugin *identities*. Plugins ship Layers/DLLs/manifests. Host merges. Theme owns rendering."
- **Effect idioms**: `Layer.mergeAll`, `Context.Tag<readonly Plugin[]>`, `Layer.unwrapEffect(discover())`, `RpcGroup` composition, Effect AI is the in-house precedent.
- **Hazards**: Gaming-first dies if plugins can grab the home screen, block boot, render their own brand, or run un-typed against the focus model. All four are preventable at the contract surface.

The translation to Korri:

```
                        ┌────────────────────────────────────┐
                        │   Composition root (route/page)    │
                        │   - reads @app/host registry       │
                        │   - chooses Layer set              │
                        └────────────────────────────────────┘
                                       │
                            seeds layerAtoms via
                            useAtomInitialValues
                                       ▼
                        ┌────────────────────────────────────┐
                        │   Plugin host registry             │
                        │   - Context.Tag<ContentSource[]>   │
                        │   - Context.Tag<ActionRunner[]>    │
                        │   - Layer.mergeAll(...plugins)     │
                        └────────────────────────────────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                ▼                      ▼                      ▼
        ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
        │ @plugins/    │      │ @plugins/    │      │ @plugins/    │
        │   gaming     │      │   jellyfin   │      │   bixis      │
        │ (in-tree)    │      │ (in-tree)    │      │ (in-tree)    │
        └──────────────┘      └──────────────┘      └──────────────┘
                ▲                      ▲                      ▲
              ships             contributes              contributes
            LibrarySourceLayerRpc,    ContentSourceLayer,  ContentSourceLayer,
            LauncherLayerRpc          RpcGroup,            RpcGroup,
                                      NixOS module          systemd unit

                        ┌────────────────────────────────────┐
                        │   ~/.config/korri/plugins/<id>     │  ← user-installed
                        │   discovered, sandboxed,           │     (same contract,
                        │   capability-gated                 │      different trust)
                        └────────────────────────────────────┘
```

Three plugin types, after Playnite:

| Type | Effect shape | Examples |
|---|---|---|
| **ContentSource** | `Context.Tag<readonly ContentSource[]>` | Gaming library, Jellyfin movies, Bixis tracks, ROM scraper |
| **MetadataProvider** | `Context.Tag<readonly MetadataProvider[]>` | IGDB, TMDB, MusicBrainz, custom user provider |
| **GenericPlugin** | `Context.Tag<readonly GenericPlugin[]>` | Custom actions, secondary panels, lifecycle hooks |

Everything else (themes, transports, sessiond, input) stays exactly as it is.

---

## Layer 2 — What's already plugin-shaped vs hardcoded

### Plugin-shaped today

| Seam | File | Notes |
|---|---|---|
| `LibrarySource` service | `korri/shared/library/library-services.ts` | Already multiplexes proseql vs rocknix at the Live layer |
| `Launcher` service | `korri/shared/library/library-services.ts` | Real impls: shell, session, memory, rpc |
| `ForegroundSessionStatusSource` | `korri/shared/stream/foreground-session-status-source.ts` | Live + Fixture layers, polled at 1Hz via `Atom.withRefresh` |
| RPC group composition | `korri/products/app/api/app-rpc-group.ts` | `RpcGroup.make(...)` + `toLayer(...)` — registry-shaped |
| Federation tagging | `korri/shared/api/rpc/entry-source.ts` | Per-entry `EntrySource` with `isLocal/hostId/controlUrl` already federates |
| Feature gates | `korri/shared/gates/*` + middleware | A per-plugin enable/disable gate fits this surface |
| Atom seeding for swaps | `korri/products/app/features/home/HomeRuntimeLayersRoot.tsx` | Composition-root layer seeding pattern |

### Gaming chokepoints

| Lock-in | File | Why it blocks plugins |
|---|---|---|
| `LibrarySource.list(): ResolvedGameRecord[]` | `library-source.ts:36-41` | `ResolvedGameRecord` is gaming-only (system, gamelist fields) |
| `LaunchSpec = {command, args, env, cwd}` | `launcher.ts:31-45` | Assumes spawnable process. "Open Jellyfin episode" is not a `LaunchSpec` |
| `LaunchFailureKind` literal union | `launcher.ts:51-62` | Closed list. Plugins can't add `media-decode-failed`, `track-drm-blocked`, etc. |
| Routes are flat + gaming-implicit | `routes/+index.tsx`, `+screen.tsx` | No `/<plugin>/...` namespace; TanStack file-router is build-time |
| Single theme, single home | `themes/shift/pages/ShiftHomePage.tsx` | Only `shift/`; `ShiftHomeReadyBody` written against the games rail |
| RPC namespace is flat `app.*` | `api/app-rpc-group.ts` | No `plugin.<id>.*` convention; handler record statically typed |
| `app.source.status` schema | `api/source/status.rpc.ts` | Uses `streamControl`/`catalog` — game-stream vocabulary |
| Stream/foreground coupling | `shared/stream/foreground-session-owner.ts` | Assumes one foreground app at a time; no "background session" |
| `launchAtom` shape | `library-atoms.ts:75-95` | Ties press-tile→action to `id → LaunchSpec → spawn` |

---

## Layer 3 — What to steal from prior art

### Playnite (steal the most)

- **Plugin type taxonomy** (`LibraryPlugin` / `MetadataPlugin` / `GenericPlugin`) — closed enum, not open string. Tells the host exactly which interfaces to expect.
- **`SupportedFields`** — a metadata plugin declares which fields it can provide. The theme decides what to display. Plugins never own rendering.
- **`IPlayniteAPI` constructor injection** — the host passes its own Layer to the plugin. In Effect terms: plugin's `R` channel is what it can `yield*`.
- Reference: <https://api.playnite.link/docs/tutorials/extensions/intro.html>

### VSCode (steal the discipline)

- **Activation events** — `onView:<id>`, `onCommand:<id>`, `onStartupFinished`. Never `"*"`. Plugin code doesn't run until the user touches its surface. Translates to lazy `Layer.suspend` + `Layer.unwrapEffect` keyed on first-read.
- **Contribution points declared in manifest** — host can render plugin's surface entries *before* code activates. The manifest is data; activation is code.
- **No DOM access, no custom CSS** — extensions contribute to defined extension points only. This is the rule that protects the theme.
- Reference: <https://code.visualstudio.com/api/references/activation-events>

### Decky Loader (steal the surface model)

- **Plugins get a secondary surface (QAM), never the primary one.** Steam owns the home grid forever. Decky plugins inject into a separate overlay reachable by a hardware button. Korri's equivalent: the home page stays Shift's; plugins get secondary routes (e.g. `/plugin/<id>/*`) and a "drawer" or "library switcher" surface.
- Reference: <https://deepwiki.com/SteamDeckHomebrew/decky-loader>

### Effect AI (steal the precedent)

- `@effect/ai` is the canonical Effect plugin shape in production. Base package declares abstract services (`LanguageModel`); provider packages (`@effect/ai-openai`, `-anthropic`, `-google`) ship concrete Layers. Host knows providers only by their service tag.
- This is the exact shape Korri needs for content sources. `@korri/plugin-base` declares `ContentSource`; `@korri/plugin-gaming`, `@korri/plugin-jellyfin`, `@korri/plugin-bixis` each ship a Layer.

### Jellyfin (steal the install pipeline, skip the .NET)

- Remote JSON manifest repo + checksum-verified `.zip` install + `targetAbi` version gate + plugin lifecycle `Active → Restart → Superseded → Deleted`.
- The TS equivalent: a plugin index JSON, signed manifests, dynamic `import()` of a single entrypoint that exports a Layer factory, and an ABI version field that the host validates before loading.

### libretro (steal the negotiation)

- **Environment callback** — the core *asks* the frontend for capabilities. If the frontend doesn't know the constant, it returns `false` and the core degrades. Translates to `Effect.serviceOption(ExtraCapability)`: plugin requests, host either provides or doesn't, plugin handles `Option.none()`.

### What NOT to steal

- **VSCode's separate extension host process** — IPC latency on every controller input is unacceptable for a gaming-first app.
- **Obsidian's full trust** — fine for in-tree first-party plugins; wrong for any user-installed plugin distributed publicly.
- **Plex's rendering-per-client model** — proven dead end; Plex sunsetted exactly this.
- **Kodi's WebView addons** — proves that giving plugins a raw render surface always ends in jarring brand inconsistency.

---

## Layer 4 — Concrete contract sketches (Effect + Schema)

### 4.1 The generalized content contract

```ts
// korri/shared/host/content-item.ts
export const ContentItem = Schema.Union(
  Schema.TaggedStruct("GameItem", { /* current ResolvedGameRecord fields */ }),
  Schema.TaggedStruct("MediaItem", { /* episode, movie, series */ }),
  Schema.TaggedStruct("TrackItem", { /* music */ }),
  Schema.TaggedStruct("AppItem",   { /* generic launcher entry */ }),
)
export type ContentItem = Schema.Schema.Type<typeof ContentItem>

// korri/shared/host/content-source.ts
export interface ContentSourceService {
  readonly id: string                          // "korri.gaming" | "korri.jellyfin" | …
  readonly kinds: ReadonlyArray<ContentItem["_tag"]>  // declared up front (manifest-shaped)
  readonly list: () => Effect.Effect<readonly ContentItem[], ContentError>
  readonly resolve?: (
    item: ContentItem,
    inputs?: ResolveInputs,
  ) => Effect.Effect<ResolvedIntent, ContentError>
}
export class ContentSources extends Context.Tag("ContentSources")<
  ContentSources,
  ReadonlyArray<ContentSourceService>
>() {}
```

### 4.2 The generalized action contract

```ts
// korri/shared/host/intent.ts
export const Intent = Schema.Union(
  Schema.TaggedStruct("SpawnIntent",    { spec: LaunchSpec, extras: Schema.optional(LaunchExtras) }),
  Schema.TaggedStruct("StreamIntent",   { hostId: Schema.String, appId: Schema.String }),
  Schema.TaggedStruct("NavigateIntent", { route: Schema.String }),
  Schema.TaggedStruct("OpenInAppIntent",{ pluginId: Schema.String, payload: Schema.Unknown }),
)
// Plugins can add Intent kinds via Schema.Union extension — but the host
// only routes kinds it understands. Unknown intents fail at the seam.
```

`LaunchSpec` survives as the inner shape of `SpawnIntent`. Existing `Launcher` becomes the `ActionRunner` for `SpawnIntent`-shaped intents. Other intent kinds get their own runners. The current `launchAtom` becomes `runIntentAtom`, dispatching by `_tag`.

### 4.3 The host registry (Effect idiom)

```ts
// korri/products/app/host/plugin-registry-layer.ts
const HostLayer = Layer.mergeAll(
  GamingPluginLayer,     // @plugins/gaming/layer
  JellyfinPluginLayer,   // @plugins/jellyfin/layer
  BixisPluginLayer,      // @plugins/bixis/layer
  // user plugins discovered at runtime:
).pipe(
  Layer.provide(Layer.unwrapEffect(discoverUserPlugins())),
)

// Per-plugin layer template:
export const GamingPluginLayer: Layer.Layer<ContentSources | RpcGroup.Handler<…>> =
  Layer.merge(
    Layer.succeed(ContentSources, [makeGamingContentSource()]),
    GamingRpcs.toLayer(/* handlers */),
  )
```

### 4.4 Capability scoping (per Effect platform)

```ts
// Plugin declares what it needs in its R channel.
const jellyfinList: Effect.Effect<readonly ContentItem[], FetchError, HttpClient.HttpClient> = ...
const bixisList:    Effect.Effect<readonly ContentItem[], ScanError,  FileSystem.FileSystem> = ...

// Host grants selectively at the composition root.
// If host omits the capability, the program won't compile.
// For runtime-discovered plugins, the host inspects the manifest before granting.
```

### 4.5 The plugin manifest (Schema, not JSON-by-hand)

```ts
export const PluginManifest = Schema.Struct({
  id: Schema.String.pipe(Schema.pattern(/^[a-z][a-z0-9-]*$/)),
  name: Schema.String,
  version: Schema.String,
  targetAbi: Schema.Literal("1"),         // host bumps when contract changes
  types: Schema.Array(Schema.Literal("content-source", "metadata", "generic")),
  capabilities: Schema.Array(Schema.Literal("fs", "net", "subprocess")),
  contributes: Schema.Struct({
    contentKinds: Schema.optional(Schema.Array(Schema.String)), // declared up front
    rpcNamespace: Schema.optional(Schema.String),               // "plugin.<id>.*"
    routes: Schema.optional(Schema.Array(Schema.String)),       // "/plugin/<id>/…"
    secondarySurfaces: Schema.optional(Schema.Array(Schema.Literal("drawer", "library-switcher"))),
  }),
  minHostVersion: Schema.String,
  inputContract: Schema.Literal("gamepad-first"),  // refusal-shaped: no plugin loads without declaring
})
```

The manifest is data the host validates before loading code. Contribution points (`contentKinds`, `routes`, `secondarySurfaces`) let the host pre-render plugin UI shells before activation. Activation is lazy.

---

## Layer 5 — Trust + distribution + failure containment

### Trust gradient (this is the gradient you wanted)

| Tier | Lives at | Distribution | Trust | Sandboxing |
|---|---|---|---|---|
| **In-tree first-party** | `korri/plugins/<id>/*` | Source tree | Audited | None — runs in host runtime |
| **Community / vetted** | `~/.local/share/korri/plugins/<id>/` | Plugin index JSON + signed manifest + `.zip` | Reviewed | Effect capability grant only (no fs/net unless declared) |
| **User / sideload** | `~/.config/korri/plugins/<id>/` | Drop-in folder, dev mode | Self-trusted | Optional `isolated-vm` worker for untrusted code paths |

The contract surface is identical across tiers. **Trust ≠ technical access.** A sideloaded plugin can be capability-scoped; a first-party plugin can have broad access. Bind capabilities to the manifest, not the tier.

### Failure containment

| Plugin type | Containment |
|---|---|
| In-tree, runs in host fiber tree | `Effect.catchAll` at the seam. Plugin failures become typed errors; host stays up. |
| In-tree, CPU-heavy | Run inside a Bun worker via `@effect/platform-bun` Worker layer. |
| Community / user sideload | `isolated-vm` isolate with V8-level resource limits. Wire protocol is Effect Schema-validated RPC over `MessageChannel`. |

`node:vm` is explicitly NOT a sandbox. The 2025+ choice for untrusted JS is `isolated-vm` (Node/Bun) or Cloudflare workerd-style isolates if you want the gold standard. For Korri's actual plugin volumes (1-10 plugins, none hot-path), `isolated-vm` is more than enough.

### Surface budget (so plugins don't slow boot)

- **Lazy activation by contribution declaration.** Plugin doesn't construct its Layer until first read of its content (matches VSCode's `onView` / Effect's `Layer.suspend`).
- **`Atom.swr` + `Atom.withRefresh` on plugin-derived atoms.** Plugin content is async by default; host shows skeleton while plugin warms.
- **No plugin runs at the route-root composition root.** Plugin Layers attach at the *plugin's own route or surface*. The gaming home page never `useAtomValue`s a plugin atom directly.

### NixOS surface

```nix
# nix/modules/korri-plugins.nix
options.services.korri.plugins = mkOption {
  type = types.attrsOf (types.submodule { … });
};

# Per first-party plugin:
# nix/modules/plugins/jellyfin.nix
services.korri.plugins.jellyfin = {
  enable = true;
  package = pkgs.korri-plugin-jellyfin;
  settings = { url = "http://media.local:8096"; };
};
```

The plugin module registers a package + (optional) systemd unit + (optional) sessiond launcher allowlist entry. Mirrors the existing per-concern shape. User plugins skip the Nix surface entirely — they live in `~/.config/korri/plugins/<id>/` and are discovered at runtime.

---

## Layer 6 — First move: one file, one PR

### The smallest change that unlocks everything else

**File:** `korri/shared/library/library-services.ts`
**Change:** introduce `ContentSource` + `ContentItem` + `ContentSources` (collection tag) alongside the existing `LibrarySource`. Keep `LibrarySource` as a type alias:

```ts
export type LibrarySource = ContentSource & {
  readonly list: () => Effect.Effect<readonly Extract<ContentItem, { _tag: "GameItem" }>[], LibraryError>
}
```

Why this is the right first move:

1. **Zero behavior change.** Existing call sites still see `LibrarySource`, still get `ResolvedGameRecord`-shaped data. The new shape is structurally a superset.
2. **Forces the contract decision early.** The hard question — "what is the supertype of a game, a movie, a track?" — has to be answered to do *anything* plugin-ish. Answer it once, in the file that's already the smallest seam in the system, and the rest of the work is mechanical.
3. **`library-atoms.ts` updates are trivial.** `librarySourceLayerAtom` becomes one of many `contentSourceLayerAtoms`. `launchAtom` becomes `runIntentAtom` dispatching by `_tag`.
4. **No new alias, no new directory, no new Nix module needed yet.** Those follow naturally in subsequent PRs.

### Sequenced after that (rough order, not committed):

1. PR1: introduce `ContentSource` / `ContentItem` / `Intent` shapes alongside existing types. No behavior change.
2. PR2: convert `LibrarySource` Live + RPC layers to implement `ContentSource` returning only `GameItem`s. Internal refactor.
3. PR3: introduce `korri/plugins/gaming/*` directory + `@plugins/*` alias. Move the gaming-specific config out of `shared/library` into `plugins/gaming`. Establish Fallow zones.
4. PR4: introduce `PluginManifest` schema + manifest validation. Mandatory for in-tree plugins (gaming gets one too).
5. PR5: add `services.korri.plugins.<id>` NixOS umbrella + per-plugin module template. Gaming = first first-party plugin module.
6. PR6: build a *throwaway* Jellyfin plugin under `korri/plugins/jellyfin/*` as the second-source-validates-the-contract test. Throwaway means it ships behind a feature gate, can be deleted.
7. PR7+: secondary-surface UI (drawer/library-switcher) so the home page doesn't have to know about non-gaming sources. Decky's QAM model.
8. Eventually: user plugin discovery, `isolated-vm` wrapping, plugin index repo. Not before steps 1-6 are done.

---

## Layer 7 — Hazards & open questions

### Things to avoid (named failure modes from prior art)

- **Route squatting.** Always namespace plugin routes under `/plugin/<id>/*`. Decky learned this; do not re-learn it.
- **Home screen injection.** No plugin contributes to `/`. Ever. The Shift home is `@plugins/gaming`'s exclusive surface (or the host's "library switcher" if multi-source is enabled).
- **Persistent background plugins.** Plex Channels died this way. Default to stateless, on-demand activation. Background sync is a *capability* a plugin requests, the host evaluates against device profile (handheld? probably no), not a default.
- **Plugin-owned styling.** Kodi WebView addons are the cautionary tale. The plugin contract has no `style`, no `className`, no `dangerouslySetInnerHTML` surface. Theme owns rendering. Period.
- **`activationEvents: ["*"]` equivalent.** Don't let any plugin contribute to `onStartup` without explicit user opt-in per plugin.
- **Conflating trust with isolation.** Capability declarations on the manifest, separate from distribution tier. First-party plugins still declare what they need.

### Open questions (decide before PR1)

1. **What's the gaming home's relationship to a multi-source future?** Does the Shift theme keep its games-only home, with a separate `Korri Library` surface for multi-source? Or does the home become a "primary source picker" with gaming as the default-current-source? The Steam Deck answer is: home stays gaming. Recommended.
2. **Is `Intent` extensible by plugins, or closed?** Closed is safer (host routes only what it knows). Extensible needs a host-level intent registry. Start closed; open later if needed.
3. **Do user-installed plugins ship inside the Nix closure or outside it?** Outside, in `~/.config/korri/plugins/`. Otherwise NixOS becomes a hard distribution requirement and the "just for me" tier dies.
4. **Effect RPC namespace policy.** `plugin.<id>.<action>` is the obvious convention. Need to add a Fallow boundary rule that handler files can only live under their plugin's directory.
5. **What's the input-contract enforcement mechanism?** Manifest field `inputContract: "gamepad-first"` is necessary but not sufficient. Probably need a Storybook-shaped harness check + a Playwright assertion that all plugin contribution surfaces are LRUD-reachable.

---

## Appendix — Source briefs

The four parallel research outputs live at:

- `/tmp/korri-research/codebase-scan.md` — ground-truth scan of plugin-ready seams vs gaming chokepoints (74 lines)
- `/tmp/korri-research/plugin-patterns-research.md` — VSCode, Obsidian, HA, Plex/Jellyfin, Playnite, libretro, JS sandboxing (121 lines)
- `/tmp/korri-research/effect-plugin-idioms.md` — Effect Layer composition, RpcGroup, Schema contracts, capability scoping (207 lines)
- `/tmp/korri-research/gaming-first-hazards.md` — privileged core, surface budget, latency budget, input model, theme separation, trust model, failure containment (142 lines)

Each is dense markdown with primary-source citations. Pull any of them into the next session if a specific decision needs deeper backup.

---

## Closing read

You don't need to "design a plugin system" so much as **name what you already have** and remove three or four type-level commitments that say "gaming" where they should say "content." Effect gave you DI for free; the home page taught you composition roots; Playnite proved the taxonomy works in the gaming domain; Decky proved the surface-budget discipline; Effect AI proved the multi-provider Layer pattern.

The hardest decision is not "how do plugins work" — it's "what is a game, a movie, a track, a thing, generically, in Korri?" Answer that in `library-services.ts` and the rest is small PRs.
