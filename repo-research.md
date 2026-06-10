# Repository Research Summary

> **Scope:** Korri config-graph migration — replacing the singleton library-root model with a
> multi-root config graph backed by ProseQL 0.14.0 `documentGraph`.  
> **Branch:** trunk  
> **Date:** 2026-06-10

---

## Technology & Infrastructure

- **Languages / runtime:** TypeScript 74.6 %, TSX 10.6 %, Nix 11.3 %, Shell 0.8 %, HTML 0.6 %
- **Runtime:** Bun (test runner + bundler + Node-compat server)
- **Frameworks:** React 19, Effect v4 (atoms, layers, Schema, RPC), Hono (HTTP server), Vite (portal SPA), TanStack Router
- **UI:** Tailwind CSS + Radix UI primitives + Framer Motion
- **Linter/formatter:** Biome (`just lint` / `just format`)
- **Type safety:** TypeScript strict mode; Biome for lint; `just typecheck` (whole-repo only due to path aliases)
- **Deployment model:** NixOS modules (kiosk + headless server images), Nix flakes + direnv for local tooling
- **API surface:** Hono HTTP (`/api/*`), Effect RPC over POST `/api/rpc`, SSE at `/api/library/events`
- **Data layer:** ProseQL 0.14.0 (`@proseql/node`) — single `documents` source today; `documentGraph` source available and targeted
- **Module aliases:** `@product/*` → `product/`, `@platform/*` → `product/platform/`
- **Monorepo shape:** Single Bun workspace; `product/apps/`, `product/services/`, `product/platform/`, `product/systems/`, `tools/`
- **Test harness split:** Bun test for all TypeScript; Nix `runCommand` / module-eval checks for Nix-owned contracts

---

## Architecture & Structure

### Repository layout (relevant subtrees)

```
product/
  apps/
    portal/
      api/
        hono-app.ts               ← Hono router; registers /api/library/events and /api/rpc
        library/
          events.ts               ← SSE handler; watches single KORRI_LIBRARY_ROOT
          events.test.ts
        server/                   ← serverRpcHandler (korrid surface)
      features/home/
        HomeRuntimeLayersRoot.tsx ← EventSource(/api/library/events) → refreshes libraryItemsAtom
    desktop/
      api-forwarder.ts            ← Forwards /api/* (including SSE) to upstream korrid
  services/device/
    korrid.ts                     ← Korri daemon: starts Hono + mDNS advertisement
  platform/
    config/
      xdg-paths.ts                ← korriDataPath(), korriConfigPath(), korriStatePath()
    library/
      library-services.ts         ← LibrarySource, Launcher Context.Service declarations
      library-source-layer-live.ts← buildLibraryRootFromEnv(); switches proseql ↔ rocknix
      library-source-layer-live.test.ts
      proseql/
        library-db.ts             ← openKorriLibraryDb(); makeKorriLibraryDbConfig(); codec shims
        library-db.test.ts        ← comprehensive ProseQL/YAML contract tests
        library-repository.ts     ← createLibraryRepository(db); loadReadableSnapshot()
      config/
        records/                  ← Effect Schema: App, System, Library, Global, Host, etc.
        cascade-resolver.ts       ← resolveReadableLaunchContext(); six-layer cascade
    react/library/
      library-atoms.ts            ← libraryItemsAtom, librarySourceLayerAtom, libraryRuntime
product/systems/nixos/
  modules/
    korri-daemon.nix              ← services.korri.daemon; library.root, library.platformDefaults
    korri-sessiond.nix            ← services.korri.sessiond; inherits library env from daemon
    korri-runtime.nix             ← services.korri.runtime; user/group/stateRoot/gamesRoot
  images/platforms/
    rocknix-sm8550.nix            ← Sets services.korri.daemon.library.platformDefaults
tools/testing/
  library/
    with-temp-proseql-library.ts  ← Test helper: temp root + seed + cleanup
    with-temp-proseql-library.test.ts
  nix/
    korri-daemon-module-check.nix ← Pure module-eval assertions for korrid options
```

### Architectural decisions already in place

- **ProseQL is the canonical library store.** ROCKNIX is an import-only path; the live
  ProseQL source is always used unless `KORRI_LIBRARY_SOURCE=rocknix` is set explicitly.
- **`documents` source (single root, writable outbox).** Today `makeKorriLibraryDbConfig`
  declares one `documents` source over a single `root` with `include: "**/*.yaml"` and
  `outbox: "library.yaml"`.
- **Platform defaults are a pre-installed YAML fragment.** The Nix module generates
  `00-korri-platform-defaults.yaml` and installs it into the same `library.root` directory
  via `ExecStartPre` before `korrid` starts. It is discovered by the glob alongside user YAML.
- **Cascade resolver is already six-layer deep-merge.** `cascade-resolver.ts` reads
  collections from a `ReadableConfigSnapshot` built from the ProseQL db and assembles
  `global → user → system → launcher → game → preset → ephemeral`.
- **Strict-mode schema validation.** YAML fragments that contain unknown keys or old
  collection names (`games`, `launchers`, `modules`, `config`) fail loudly at decode time.
- **Atoms own reactive refresh.** `libraryItemsAtom` is an Effect atom; `HomeRuntimeLayersRoot`
  subscribes to SSE and calls `useAtomRefresh(libraryItemsAtom)` on `library.changed`.

---

## Current Singleton-Root Code Paths (the seams to replace)

### 1. Environment variable: `KORRI_LIBRARY_ROOT`

| File | Usage |
|------|-------|
| `product/platform/library/library-source-layer-live.ts` | `buildLibraryRootFromEnv()` reads `process.env.KORRI_LIBRARY_ROOT`; falls back to `korriDataPath(env, "library")` |
| `product/apps/portal/api/library/events.ts` | `resolveLibraryRoot()` reads `process.env.KORRI_LIBRARY_ROOT`; falls back same way |
| `product/systems/nixos/modules/korri-daemon.nix` | `serverEnv.KORRI_LIBRARY_ROOT = cfg.library.root` |
| `product/systems/nixos/modules/korri-sessiond.nix` | Re-exports `KORRI_LIBRARY_ROOT` from `daemonLibraryRoot` |
| `product/services/device/sessiond-electrobun.ts` | Reads env for session context |

### 2. Nix module options (korri-daemon.nix)

```nix
services.korri.daemon.library = {
  source  # enum ["proseql" "rocknix"]
  root    # string; default "${stateRoot}/library"
  platformDefaults  # attrset; rendered to 00-korri-platform-defaults.yaml in library.root
}
```

- `platformDefaultsFileName = "00-korri-platform-defaults.yaml"` — lexically first so it
  loads before user YAML in the single-root glob.
- `platformDefaultsInstallCommands` — `install -D -m 600 ${file} ${cfg.library.root}/${name}`.
- `ReadWritePaths` in systemd hardening includes `cfg.library.root`.
- `systemd.tmpfiles.rules` creates `cfg.library.root` in system mode.

### 3. ProseQL db config (library-db.ts)

```ts
export function makeKorriLibraryDbConfig(root: string) {
  return {
    collections: collectionsSchema,       // 10 canonical sections
    sources: [{
      id: "library",
      kind: "documents",                  // ← single-root mutable documents source
      root,                               // ← the one KORRI_LIBRARY_ROOT
      include: "**/*.yaml",
      format: "yaml",
      collections: "all",
      outbox: "library.yaml",             // ← writable output target
    }],
  } as const
}
```

### 4. SSE handler (events.ts → hono-app.ts)

```ts
// hono-app.ts
app.get("/api/library/events", c => handleLibraryEvents(c))

// events.ts
function resolveLibraryRoot(env) {
  const explicit = env.KORRI_LIBRARY_ROOT?.trim()
  if (explicit) return { ok: true, root: explicit }
  return { ok: true, root: korriDataPath(env, "library") }
}
// Watches ONE root directory with node:fs.watch
// Emits: "library.ready" { root: basename } and "library.changed" { path }
// Filter: isYamlFilename (only *.yaml / *.yml)
```

### 5. React refresh bridge (HomeRuntimeLayersRoot.tsx)

```tsx
const events = new EventSource("/api/library/events")
events.addEventListener("library.changed", () => refreshLibraryItems())
// Connects to /api/library/events. Name is hardcoded.
```

---

## ProseQL 0.14.0 `documentGraph` API

This is the target source kind for the config-graph model.

### Config shape

```ts
interface DocumentGraphSourceConfig {
  id: string
  kind: "documentGraph"
  roots: ReadonlyArray<DocumentGraphRootConfig>  // ordered list of roots
  collections?: SourceCollectionSelection        // defaults to all
  include?: string | ReadonlyArray<string>       // glob applied to each root
  exclude?: string | ReadonlyArray<string>
  transform?: DocumentGraphTransform             // pure per-fragment decode hook
}

interface DocumentGraphRootConfig {
  id?: string         // optional stable identifier
  root: string        // directory path
  optional?: boolean  // if true, missing root is silently skipped
  include?: string | ReadonlyArray<string>
  exclude?: string | ReadonlyArray<string>
}
```

### Key behaviors

- **Ordered roots.** Fragments are discovered per root in array order; within a root,
  files are sorted lexically by relative path.
- **Deep-merge semantics.** Later roots (and later files within a root) win.
  `deepMergeAll`: plain objects merge recursively, arrays/scalars/null replace wholesale.
- **Read-only collections.** `documentGraph` collections reject every mutation operation.
  This means `outbox` / write semantics do not apply to graph-owned collections.
- **Optional roots.** `optional: true` means a missing root is skipped; `optional: false`
  (default) means a missing root is a hard `DocumentGraphSourceError`.
- **Multi-format.** Extension-driven: `.yaml`, `.yml`, `.json`, `.toml`, etc. all supported
  by the registered codec set. The `include` glob controls which files are picked up.
- **Per-fragment transform.** The `transform` function is called per decoded document before
  migration, allowing the host YAML shim (e.g. the `host:` singleton unwrap) to be applied.
- **Watch behavior.** At startup, each present root gets its own watcher. Roots absent at
  startup are not watched; a missing-optional root never triggers a watch attempt.
- **Error surface.** `DocumentGraphSourceError` with `kind`:
  `"missing-root"`, `"unsupported-extension"`, `"transform-error"`, `"validation-error"`,
  `"duplicate-record"`.
- **`LoadedDocumentGraph`** return shape includes `collections` (merged records per collection)
  and `contributingPaths` (provenance map for error enrichment).

---

## Platform Defaults Pattern (current + migration target)

### Current behavior

1. Nix generates `00-korri-platform-defaults.yaml` from `services.korri.daemon.library.platformDefaults`.
2. ExecStartPre installs it into `${library.root}/00-korri-platform-defaults.yaml` before korrid starts.
3. The `documents` source globs `**/*.yaml` and discovers both the platform file and user `library.yaml`.
4. Because the `documents` source uses a single root with `outbox: library.yaml`, writes always
   go to `library.yaml`; the platform file is never touched by korrid writes.
5. The `library-db.test.ts` "platform-default collision guard" test verifies that if both the
   platform fragment and user fragment declare the same app record, the db fails loudly.
6. Lexical ordering (`00-korri-*` < `library.yaml`) means platform defaults load first and
   user YAML overlays them — implementing "later roots/files win" by filename prefix convention.

### Migration target

- Platform defaults become a **separate, earlier root** in the `documentGraph` config.
- The platform-generated root is an NixOS-owned store path (read-only by construction).
- User config roots come after → user wins by array order.
- No more filename-prefix tricks for ordering precedence.

---

## Proposed New Config Contract

### Environment variable: `KORRI_CONFIG_ROOTS`

- Value: colon-separated ordered list of directory paths (like `PATH`).
- Each directory is a config root; later directories win on merge.
- Empty-string entries are ignored.
- An empty `KORRI_CONFIG_ROOTS` with no XDG fallback → valid empty baseline (no error).
- Fallback: `korriConfigPath(env, "library")` (i.e. `~/.config/korri/library`) when both
  `KORRI_CONFIG_ROOTS` and an explicit root env are absent. (Or retain `korriDataPath`
  fallback; align with whatever XDG base matches the chosen store semantics.)

### Nix option: `services.korri.config.roots` (or extend `services.korri.daemon.library`)

```nix
# Sketch — final name TBD by the plan
services.korri.daemon.library = {
  roots = mkOption {
    type = types.listOf types.str;
    default = [ "${config.services.korri.runtime.stateRoot}/library" ];
    description = "Ordered list of config root directories. Later roots win on deep-merge.";
  };
  # platformDefaults becomes the first generated root, not an installed file
};
```

Exported to korrid env as:
```nix
KORRI_CONFIG_ROOTS = lib.concatStringsSep ":" cfg.library.roots;
```

### ProseQL source declaration (library-db.ts replacement sketch)

```ts
export function makeKorriLibraryDbConfig(roots: readonly string[]) {
  return {
    collections: collectionsSchema,
    sources: [{
      id: "config",
      kind: "documentGraph" as const,
      roots: roots.map((root, i) => ({
        id: `root-${i}`,
        root,
        optional: true,                     // empty baseline is valid
        include: ["**/*.yaml", "**/*.yml"],  // or broader: add json/toml when ready
      })),
      collections: "all" as const,
      transform: korriReadableDocumentTransform,  // host-singleton unwrap + strict validation
    }],
  } as const
}
```

Write target is separated from the read graph. The writable path (`outbox`) belongs to
a standalone writeable root, not to the documentGraph source. KORRID owns last-known-good
lifecycle by writing to an explicit designated root (separate concern from read config).

### Glob pattern

The plan specifies discovering `**/korri.<ext>` and `**/*.korri.<ext>`. Current code uses
`**/*.yaml`. ProseQL `documentGraph` applies the `include` pattern as a glob relative to
each root. A combined pattern would be:

```ts
include: ["**/korri.yaml", "**/korri.yml", "**/*.korri.yaml", "**/*.korri.yml",
          "**/korri.json", "**/*.korri.json", "**/korri.toml", "**/*.korri.toml"]
```

All ProseQL-supported formats are handled by extension inference; the codec is chosen
per-file automatically once the extension is registered. The current `korriReadableYamlCodec`
shim only registers `yaml`/`yml`; new formats need their own shim or a bare codec.

### Config events SSE: `/api/config/events`

Replace `/api/library/events` with `/api/config/events`:

```ts
// New route in hono-app.ts
app.get("/api/config/events", c => handleConfigEvents(c))

// New handler reads KORRI_CONFIG_ROOTS (list), watches all present roots.
// Emits: "config.ready" { roots: string[] } and "config.changed" { root, path }
```

The React bridge in `HomeRuntimeLayersRoot.tsx` updates its `EventSource` URL from
`/api/library/events` to `/api/config/events` and listens for `config.changed`.

**Backwards compatibility:** The plan says no legacy support for `/api/library/events`.
The hono-app route registration and the desktop api-forwarder both need updating.

---

## Event / API Route Inventory

| Route | File | Current role | Migration action |
|-------|------|-------------|-----------------|
| `GET /api/library/events` | `hono-app.ts` + `events.ts` | SSE watcher on single `KORRI_LIBRARY_ROOT` | Replace with `/api/config/events`; delete old handler |
| `POST /api/rpc` | `hono-app.ts` + `rpc-server.ts` | Effect RPC (library list, launch, etc.) | No route change; internal layer swap |
| `GET /api/health` | `hono-app.ts` | Health check | No change |
| `GET /api/game-assets/*` | `hono-app.ts` + `game-asset-bytes.ts` | Binary asset serving | No change |

---

## Test Patterns to Follow

### TypeScript unit test conventions

```ts
// Temp root creation (library-db.test.ts)
async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-library-"))
  try { return await fn(root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

// Effect-scoped db open
await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
      // ...
    }),
  ),
)

// Env cleanup (library-source-layer-live.test.ts)
const originalEnv = { libraryRoot: process.env.KORRI_LIBRARY_ROOT }
afterEach(() => setOptionalEnv("KORRI_LIBRARY_ROOT", originalEnv.libraryRoot))
```

### Test helper: `withTempProseqlLibrary`

`tools/testing/library/with-temp-proseql-library.ts` — seeds a temp ProseQL root from
a typed `TempProseqlLibrarySeed`. Will need a parallel `withTempConfigGraph` helper that
accepts an array of roots with per-root seed YAML content.

### Nix check conventions (korri-daemon-module-check.nix)

```nix
check = message: assertion: { inherit message assertion; };
evaluateWith = overrides: (evalConfig { modules = [ korriDaemonModule baseModule overrides ]; }).config;
checks = [
  (check "user-mode library root defaults to Korri product state" (
    defaultUserMode.services.korri.daemon.library.root == "/var/lib/korri/library"
    && (env defaultUserMode).KORRI_LIBRARY_ROOT == "/var/lib/korri/library"
  ))
];
```

New checks to add:
- `services.korri.daemon.library.roots` list defaults to `[stateRoot/library]`
- `KORRI_CONFIG_ROOTS` env exported as colon-joined list
- Platform defaults installed into first generated root (not user root)
- `ReadWritePaths` in hardening updated to include all writable roots

---

## KORRID Last-Known-Good Lifecycle

The plan context assigns `/api/config/events` and last-known-good lifecycle to KORRID.
Currently, `korrid.ts` simply starts `createHonoApp({ rpcSurface: "server" })` and mDNS.
There is no caching or snapshot layer in korrid's current design; `withLibraryRepository`
in `library-source-layer-live.ts` opens the ProseQL db on each RPC call via `Effect.scoped`.

The last-known-good pattern implies:
1. On startup, korrid opens the config graph and validates it.
2. If validation passes → becomes the "active" graph snapshot; SSE emits `config.ready`.
3. On `config.changed` (a file watcher fires) → reloads; if new graph validates → updates
   active snapshot; emits `config.ready` again. If validation fails → keeps last-known-good;
   emits a `config.error` event.
4. All RPC calls use the active validated snapshot rather than opening ProseQL per-call.

This is a new capability; `korrid.ts` and `library-source-layer-live.ts` will need a
persistent ProseQL handle (not scoped per call) with the `documentGraph` reactive watch.

ProseQL 0.14.0 already supports reactive watch: `documentGraph` sources watch each
startup-present root and call `reloadDocumentGraph` on change. The watch machinery is
internal to `createPersistentEffectDatabase`. Korri needs to wire the db open once at
server startup (not per-request) and feed reloads into the SSE event bus.

---

## Implementation Patterns

### Effect Service / Layer pattern (existing)

```ts
// Context.Service declaration (library-services.ts)
export class LibrarySource extends Context.Service<LibrarySource, LibrarySourceService>()("LibrarySource") {}

// Live layer (library-source-layer-live.ts)
export const LibrarySourceLayerLive = Layer.succeed(LibrarySource, createLiveLibrarySourceService())

// Test layer (library-source-layer-memory.ts)
Layer.succeed(LibrarySource)({ list: () => Effect.succeed([]) })
```

### Atom / reactive pattern (library-atoms.ts)

```ts
export const librarySourceLayerAtom = Atom.make(loadingForeverLibrarySourceLayer)
export const libraryRuntime = Atom.runtime(get => Layer.merge(get(librarySourceLayerAtom), ...))
export const libraryItemsAtom = libraryRuntime.atom(
  Effect.gen(function* () {
    const source = yield* LibrarySource
    return yield* source.listPlayableEntries()
  })
)
```

### ProseQL persistent db (current pattern, library-db.ts)

```ts
export function openKorriLibraryDb(options: KorriLibraryDbOptions) {
  const config = makeKorriLibraryDbConfig(options.root)
  const persistenceLayer = makeNodePersistenceLayer(config, { codecs: [korriReadableYamlCodec] })
  return Effect.tryPromise({ try: () => mkdir(options.root, { recursive: true }), ... }).pipe(
    Effect.flatMap(() =>
      createPersistentEffectDatabase(config, undefined, { writeDebounce: options.writeDebounce ?? 10 })
        .pipe(Effect.provide(persistenceLayer))
    ),
    // ... validation and sidecar wiring
  )
}
```

New multi-root version: `makeKorriLibraryDbConfig(roots: readonly string[])` →
`DocumentGraphSourceConfig` instead of `DocumentSourceConfig`.

### RPC handler pattern (multi-action, AGENTS.md)

```
product/apps/portal/api/<concept>/
  get.rpc.ts           ← Schema + router tag
  get.rpc-handler.ts   ← Effect handler implementation
```

New `/api/config/events` is HTTP SSE (not RPC), following the same Hono handler pattern
as `events.ts`.

---

## Key File Paths for the Implementation

| Area | File | Action |
|------|------|--------|
| Env var resolution | `product/platform/library/library-source-layer-live.ts` | Replace `buildLibraryRootFromEnv()` with `buildConfigRootsFromEnv()` returning `string[]` |
| ProseQL db config | `product/platform/library/proseql/library-db.ts` | Replace `documents` source with `documentGraph`; accept `roots: readonly string[]` |
| SSE handler | `product/apps/portal/api/library/events.ts` | Replace with new `product/apps/portal/api/config/events.ts` (watch all roots) |
| Hono router | `product/apps/portal/api/hono-app.ts` | Replace `/api/library/events` route with `/api/config/events` |
| React bridge | `product/apps/portal/features/home/HomeRuntimeLayersRoot.tsx` | Update EventSource URL; update event name |
| Nix daemon module | `product/systems/nixos/modules/korri-daemon.nix` | Add `roots` list option; emit `KORRI_CONFIG_ROOTS`; change platform defaults install path |
| Nix sessiond module | `product/systems/nixos/modules/korri-sessiond.nix` | Re-export `KORRI_CONFIG_ROOTS` analogously to `KORRI_LIBRARY_ROOT` |
| Platform defaults | `rocknix-sm8550.nix`, `rocknix-rk3566.nix` | Use dedicated read-only root instead of file install into user root |
| Test helper | `tools/testing/library/with-temp-proseql-library.ts` | Add multi-root variant |
| Nix checks | `tools/testing/nix/korri-daemon-module-check.nix` | Assert `KORRI_CONFIG_ROOTS` env and roots defaults |
| Desktop forwarder | `product/apps/desktop/api-forwarder.ts` | Forward `/api/config/events` passthrough (SSE path check update) |

---

## Parked Items (from `work/items/parking-lot/`)

Two items explicitly deferred from the config-roots scope:

1. **`01KTRYCA2EC1DBW6RJXPC4NJV4`** — Design generic removable-media Korri config roots.
   Defines device-neutral exposure of mounted media (SD cards, USB) as config roots.
   Not in scope for this slice.

2. **`01KTRYCK5XYMCSVYD55P7XWBDY`** — Define Korri config authoring write-target semantics.
   CLI/import flows need an explicit writable root. The config-graph treats reads as
   an ordered graph; write target is a separate concern that authoring tools must address.
   Not in scope for this slice.

---

## Recommendations

1. **Start from `makeKorriLibraryDbConfig`.** The highest-leverage first change is swapping
   the `documents` source for a `documentGraph` source inside `library-db.ts`. The rest
   of the codebase (repository, cascade, RPC handlers) reads from the ProseQL db handle and
   does not care which source kind produced the data. This isolates the change.

2. **Extend, don't replace, the Nix option namespace.** Add `services.korri.daemon.library.roots`
   as a `types.listOf types.str` alongside (and eventually superseding) `library.root`.
   Keep `library.root` as a deprecated single-value alias defaulting to `lib.elemAt roots 0`
   until the option is fully removed to avoid breaking all existing NixOS configs at once.

3. **Platform defaults become root-zero.** Instead of installing `00-korri-platform-defaults.yaml`
   into the user root, generate a separate Nix-store directory containing only that file,
   and prepend it to `library.roots`. The platform root is a store path — read-only by
   construction, no ExecStartPre install step needed.

4. **Keep the korriReadableYamlCodec shim.** The custom YAML codec that unwraps/wraps the
   `host:` singleton block must be registered for the `documentGraph` source in exactly the
   same way it is today. The `makeNodePersistenceLayer(config, { codecs: [korriReadableYamlCodec] })`
   call wires all roots through the same codec set.

5. **Add `KORRI_CONFIG_ROOTS` next to (not instead of) KORRI_LIBRARY_ROOT initially.**
   `buildLibraryRootFromEnv()` and `resolveLibraryRoot()` can check `KORRI_CONFIG_ROOTS` first
   (parse `:`) and fall back to `KORRI_LIBRARY_ROOT` for one transition cycle. This avoids
   breaking the desktop wrapper and existing deployed configs simultaneously.

6. **Hono route rename is a hard cut.** The plan explicitly says no legacy `/api/library/events`
   support. The React bridge, desktop forwarder test fixtures, and hono-app all name this path;
   update them together in one commit with a typecheck pass.

7. **Korrid persistent db (last-known-good).** Move `openKorriLibraryDb` out of `withLibraryRepository`
   (which opens per-call) into the korrid startup path, holding the db handle for the server
   lifetime. Wire the ProseQL reactive watch to the SSE event bus. The `documentGraph` reactive
   path in ProseQL already calls watchers per root; the host just needs to surface those events.

8. **Nix checks follow the existing module-eval pattern.** `korri-daemon-module-check.nix`
   and `korri-source-machine-image-check.nix` already assert `library.root` and
   `KORRI_LIBRARY_ROOT`. Add parallel assertions for `library.roots` and `KORRI_CONFIG_ROOTS`.
   Keep old assertions against the deprecated option until it is removed.

9. **Test isolation pattern.** New TypeScript tests should set and restore `KORRI_CONFIG_ROOTS`
   in `afterEach`, parallel to the existing `KORRI_LIBRARY_ROOT` cleanup. The
   `withTempRoot` helper should be duplicated or extended to support multi-root scenarios
   with per-root YAML content.

10. **File format scope.** For the initial slice, `include: ["**/*.yaml", "**/*.yml"]` is
    sufficient and matches current behavior. Expand to include `**/korri.json`, `**/*.korri.json`,
    etc. in a follow-up once the multi-root model is proven. Do not introduce format discovery
    beyond YAML in the same slice as the root-graph migration.
