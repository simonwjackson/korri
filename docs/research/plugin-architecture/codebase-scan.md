# Korri Plugin-Readiness Scan

Ground-truth map of where the codebase is already plugin-shaped (Effect Service + Layer + `layerAtom` swaps) versus where "gaming" is structurally baked in. No proposed changes.

## 1. Plugin-ready seams (already DI-shaped)

The stack's plugin primitive is `Context.Service` + `Layer` swapped via an `Atom.make(layer)` seam (`librarySourceLayerAtom`, `launcherLayerAtom`, `foregroundSessionStatusLayerAtom`). Production wires Live; harness/tests wire alternatives. These are the "would be plugin entrypoints today":

- **`LibrarySource`** — `korri/shared/library/library-services.ts:91-105`. Service interface `list / launchSpecFor / resolveLaunchForGame`. Live layer at `library-source-layer-live.ts` already multiplexes by env (`proseql` vs `rocknix`). Renderer-side RPC layer at `korri/products/app/features/home/library-source-layer-rpc.ts`. **A plugin that wanted to add a source would implement this interface** — but see §2: it can only return `ResolvedGameRecord`.
- **`Launcher`** — `library-services.ts:107-114`. `run / spawn?`. Real impls: `shell-launcher.ts`, `session-launcher.ts`, `launcher-layer-memory.ts`, `launcher-layer-rpc.ts`. A plugin adding a new runner (emulator, browser app, media player) implements this; `LaunchExtras.lifecycle: "foreground" | "session"` is already an extensibility hint.
- **`ForegroundSessionStatusSource`** — `korri/shared/stream/foreground-session-status-source.ts`. Single `get()` returning `ForegroundSessionGateState`. Already has `Live` and `Fixture` layers; the polling atom (`foregroundSessionGateStateAtom`, 1Hz via `Atom.withRefresh`) is plugin-agnostic.
- **RPC group composition** — `korri/products/app/api/app-rpc-group.ts` + `handlers.ts`. `RpcGroup.make(...)` followed by `appRpcGroup.toLayer(...)` is structurally a registry. Adding a plugin RPC means extending the group and handler record. Schema-first wire (Effect `Schema`) and tagged errors (`ApiError`) are already the contract.
- **Federation tagging** — `EntrySource` (`korri/shared/api/rpc/entry-source.ts`) is a structural per-entry identity tag with `isLocal/hostId/controlUrl`. This is **already plugin-shaped at the network boundary**: any RPC that returns content can carry the same source tag and federate.
- **Feature gates** — `korri/shared/gates/*` + `FeatureGatesMiddleware` on the RPC group. A per-plugin enable/disable gate fits this existing surface.
- **Atom seeding for layer swaps** — `korri/products/app/features/home/HomeRuntimeLayersRoot.tsx` seeds the three `layerAtom`s. This pattern (composition root picks layers, page/hook reads them) is the renderer's plugin DI seam.

## 2. Hardcoded "gaming" chokepoints

The seams above are shaped right, but their *types* assume games:

- **`LibrarySource.list(): ResolvedGameRecord[]`** — `korri/shared/library/library-source.ts:36-41`, `library-services.ts:62`. `ResolvedGameRecord` (`korri/shared/fixtures/games/game.ts`) is the gaming domain shape (system, gamelist fields). No "media item" supertype.
- **`LaunchSpec` is `{command, args, env, cwd}`** — `korri/shared/library/launcher.ts:31-45`. Assumes a spawnable process. A "play this Jellyfin episode" or "open Bixis playlist" intent is not a `LaunchSpec`; it's an in-app navigation/handoff. There is no `Intent` / `OpenAction` abstraction above `LaunchSpec`.
- **`LaunchFailureKind`** literal union — `launcher.ts:51-62` — is closed: `no-such-game`, `host-control-disabled`, `moonlight-failed`. Plugin-defined failure kinds cannot be added without editing this schema.
- **Routes** are flat and gaming-implicit — `korri/products/app/routes/+index.tsx` hardcodes `ShiftHomePage`; `+screen.tsx` is dual-screen for stream companion. No `/<plugin>/...` namespace, no dynamic route discovery (TanStack file-router is build-time generated; `__virtual.ts` exists but is internal).
- **Single theme, single home page** — `korri/shared/themes/shift/pages/ShiftHomePage.tsx` is *the* home. The theme directory has only `shift/`. `ShiftHomeReadyBody`, `ShiftHomePosterTile`, `ShiftHomeFeatureTile` are written against the games rail.
- **RPC namespace is flat under `app.*`** — `app-rpc-group.ts` enumerates `app.library.*`, `app.source.*`, `app.stream.*`, `app.game-assets.*`. No `plugin.<id>.*` namespace convention; the handler record is statically typed against the literal union of tags.
- **`app.source.status` schema** — `korri/products/app/api/source/status.rpc.ts` uses `streamControl`/`catalog` — game-stream vocabulary, not generic source health.
- **Stream/foreground coupling** — `korri/shared/stream/foreground-session-owner.ts` and `moonlight-control-*` assume one foreground app at a time, tied to Sunshine/Moonlight. A music plugin running in background contends with no "background session" concept.
- **launch atom shape** — `library-atoms.ts:75-95` ties `launchAtom` to `LibrarySource.launchSpecFor(id)` returning `LaunchSpec`. The renderer's entire "press tile → action" path is `id → spec → spawn`.
- **`korri-cli`** / **rocknix importer** — `tools/importers/rocknix`, `korri/shared/library/rocknix/*` are game-specific data ingestion.

## 3. Boundary layers — where plugin code would live

Current aliases: `@app/*` (single product), `@shared/*` (shared runtime). Fallow boundaries forbid shared→product imports. Three structurally consistent options against the existing layout:

- **`korri/shared/plugins/<contract>/*`** for the *contracts* (Service classes, Schemas, layerAtoms). Mirrors `korri/shared/library`, `korri/shared/stream`. Required for shared/themes to render plugin output without product imports.
- **`korri/plugins/<id>/*`** as a *new top-level layer* with its own alias (e.g. `@plugin/<id>/*` or unified `@plugins/*`). This is the cleanest fit because:
  - In-tree first-party plugins (Jellyfin, Bixis) should be siblings of `products/app`, not nested under it — they are *products of the same contract*, not features of the gaming app.
  - It preserves the rule that `@shared/*` is product-agnostic.
  - It gives Fallow a third zone: `plugins/*` may import `shared/*`, may not import `products/*` or other plugins, and `products/app` may import `plugins/*` only at composition roots.
- **`korri/products/app/plugins/*`** is the wrong shape — it would make plugins live inside the gaming product and inherit its routes/theme assumptions, defeating "first-class internal plugins" parity with user plugins.

User-installed (out-of-tree) plugins would need a runtime discovery seam (filesystem path scanned by sessiond/server, manifest schema, sandboxed import). None exists today; closest analog is `korri/shared/gates/*` registry generation via `just generate-gates`.

## 4. NixOS surface

Today: per-concern modules each declaring `services.korri.<concern>` (`server`, `client`, `kiosk`, `compositor`, `sessiond`, `gameStream`, `input`, `cli`). All eight live in `nix/modules/`, each ~independent, no umbrella. `nix/modules/korri-server.nix` resolves its package from `korri.packages.${system}.korri-server`.

Two viable plugin-NixOS shapes consistent with this layout:

- **Per-plugin modules** (`services.korri.plugins.<id>`) — each ships its own `.nix` file under `nix/modules/plugins/<id>.nix` and follows the existing per-concern pattern. First-party plugins (Jellyfin, Bixis) get first-class modules; user plugins are pure-Nix overlays.
- **Umbrella `services.korri.plugins = { <id> = { enable, package, settings }; }`** with a single `korri-plugins.nix` module iterating attrs to materialize systemd units. Closer to Home Assistant's integrations model; loses per-module type rigor but matches a registry shape.

Either way, `services.korri.server` already owns the API surface where plugin RPCs would mount, and `services.korri.sessiond` already owns lifecycle for managed launches — a plugin module's job is to register a package + (optionally) a systemd unit + (optionally) extend sessiond's launcher allowlist.

## 5. Files to read first

Contracts that would evolve:

- `korri/shared/library/library-services.ts` — Service classes (`LibrarySource`, `Launcher`) and `LibraryError`.
- `korri/shared/library/library-source.ts` — plain TS shape, returns `ResolvedGameRecord`.
- `korri/shared/library/launcher.ts` — `LaunchSpec`, `LaunchFailureKind`, `LaunchResult`, `LaunchExtras`.
- `korri/shared/library/library-atoms.ts` — `librarySourceLayerAtom`, `launcherLayerAtom`, `launchAtom`.
- `korri/shared/api/rpc/entry-source.ts` — federation identity tag.
- `korri/products/app/api/app-rpc-group.ts` + `handlers.ts` — RPC registry.
- `korri/products/app/api/library/list.rpc.ts`, `source/list.rpc.ts`, `source/status.rpc.ts` — gaming-shaped wire schemas.
- `korri/products/app/routes/+__root.tsx`, `+index.tsx`, `+screen.tsx` — only two routes; single home page.
- `korri/products/app/features/home/HomeRuntimeLayersRoot.tsx` — composition-root layer seeding pattern.
- `korri/products/app/features/home/library-source-layer-rpc.ts` — renderer→server Layer template a plugin would copy.
- `korri/shared/themes/shift/pages/ShiftHomePage.tsx` (and `ShiftHomeReadyBody.tsx`) — only theme/home; would need a multi-source/multi-surface model.
- `korri/shared/stream/foreground-session-status-source.ts` + `foreground-session-owner.ts` — lifecycle assumes single foreground.
- `nix/modules/korri-server.nix`, `korri-sessiond.nix` — pattern any plugin module would follow.

**Start here:** `korri/shared/library/library-services.ts`. It is the smallest file that shows both the plugin-shaped seam (Context.Service + Layer) and the gaming-specific type lock-in (`ResolvedGameRecord`, `LaunchSpec`). Every other chokepoint and every other plugin-ready seam radiates from this contract.
