# Repository Research Summary

> Scope: major no-backwards-compat plugin/config schema big-bang refactor
> Focus: systems, target vs launch, launchers replacing apps, provider-links refs,
>         file-set targets/input selection, settings common packs + settings.plugin,
>         plugin descriptor runtime metadata/support mappings, no backwards compatibility.
> Source document: `work/items/active/01KVGDKT01DNT9NRDKS846CJQ1-plugin-launcher-standardization/config-sketch.korri.yaml`

---

## Technology & Infrastructure

| Dimension | Detail |
|-----------|--------|
| Language | TypeScript (strict) + TSX, ~71 % / 12 % of LOC |
| Runtime | Bun (test, bundling, server); Effect v4 throughout |
| UI | React + TanStack Router + Tailwind + Vite |
| Schemas | Effect Schema (source of truth for every wire payload, record, and policy) |
| Config parse | YAML via `yaml` npm package; decoded through Effect Schema at load time |
| DB | ProseQL (YAML-backed document store abstraction) |
| Linter/formatter | Biome 2-space, double-quotes, no trailing whitespace |
| Test runner | `bun test`; E2E via Playwright |
| Nix | Flakes + direnv; all tooling in scope |
| Monorepo layout | Single root `package.json`; feature modules under `product/platform/`, `product/plugins/`, `packages/`, `tools/` |

---

## Architecture & Structure

### Config cascade (current seven-layer model)
The readable cascade resolves launch context through layers in order (least → most specific):

```
host → user → system → app → (app-choice) → runtime → library-item → contained-playable → release → profile → ephemeral-override
```

Key files:
- `product/platform/library/config/cascade-resolver.ts` — `ConfigSnapshot`, `ReadableConfigSnapshot`, `resolveReadableLaunchContext`, `resolveLocalLauncherPolicy`, `foldLayers`, `mergeReadableLayers`
- `product/platform/library/config/inheritable-fields.ts` — `InheritableLayer` (the whitelist every layer-bearing record inlines), `LaunchPolicy`, `LaunchWithPolicy`, `MoonlightPolicy`, `PluginPolicyMap`, `ByLauncherPayload`
- `product/platform/library/config/launch-block.ts` — `LaunchBlock` (`app`, `module`, `settings`, `with`, `args`, `env`, `cwd`), `LaunchSettings`
- `product/platform/library/config/resolved-launch-context.ts` — `ResolvedLaunchContext` (seven-layer schema cascade output used by old-path materializer), `ReadableResolvedLaunchContext` (new readable cascade output)
- `product/platform/library/config/app-materializer.ts` — `materializeAppLaunch`, `materializeReadableLaunch`; hard-coded `switch` over `app.integration` values (`mame`, `dolphin`, `solarus`, `generic-process`)
- `product/platform/library/config/app-integrations.ts` — `AppDescriptor`, `resolveAppDescriptor`; built-in app descriptors dict; `integrationForKind`
- `product/platform/library/config/app-choice-selection.ts` — `AppChoiceSelectionResult`, `resolveEffectiveAppChoices`, `selectAppChoice`

### ProseQL / library database
- `product/platform/library/proseql/library-repository.ts` — `LibraryRepository` interface, `createLibraryRepository`, `loadReadableSnapshot`, `ReadableLaunchIntegration` interface
- `product/platform/library/proseql/library-db.ts` — `KorriLibraryDb` (ProseQL collection wrappers)

### Plugin system
- `product/platform/plugin/index.ts` — `plugin()` factory, `KorriPlugin`, `PluginDefinitionInput`, `PluginConfigContributions`, `PluginCatalogItem/Release/Launch`, `PluginHandler`, `PluginOperation`
- `product/platform/plugin/registry.ts` — `createPluginRegistry`, `PluginRegistry`, config-map merging, `expandRequiredPluginIds`
- `product/plugins/index.ts` — `firstPartyPlugins` array, `createFirstPartyPluginRegistryFromEnv`

### Records / schemas (all in `product/platform/library/config/records/`)
| File | Key types |
|------|-----------|
| `library-item.ts` | `LibraryItemRecord`, `LibraryReleasePayload`, `ContainedPlayablePayload`; `Target` union (`TargetString | UriTarget | FileTarget | Array`); `AppChoiceList` on `release.apps[]` |
| `system.ts` | `SystemPayload` — `name`, `manufacturer`, `cores`, `apps[]`, `inherit`, `presets`, `byLauncher`; `launcher` field rejected |
| `app.ts` | `AppRecord`/`AppPayload` — `kind` (free string; `"@korri:steam"` etc.), `command`, `runtime`, `args`, `systems`, `policy`, `settings`, `launch`, `plugin`, inheritable fields |
| `launcher.ts` | `LauncherRecord`/`LauncherPayload` — `command`, `args`, `systems`; inheritable fields |
| `runtime.ts` | `RuntimeRecord`/`RuntimePayload` — `kind` (`libretro-core | tool | emulator`), `path`, `tool`, `app`, `supports.systems[]`; inheritable fields |
| `global.ts` | `GlobalConfigPayload` — `launch`, `launcher` (alias), `presets`, `byLauncher`; inheritable fields |
| `user.ts` | `UserPayload` — `displayName`, `favorites`, `hidden`, `launch`, `launcher`, `presets`, `byLauncher`; inheritable fields |
| `preset.ts` | `PresetPayload` — `name`, `description`, `launch`, `launcher`, `inherit`, `byLauncher`; inheritable fields |
| `host.ts` | `HostPayload` — plain block; no role/launch-block/nested profiles |
| `app-choice.ts` | `AppChoice` — `id`, `inherit`, `runtime`; inheritable fields; `kind` rejected |
| `provider-link.ts` | `ProviderLinkPayload` — `provider`, `playable`, `release?`, `ref: { kind, value }` (single-ref-per-record, `kind` in `url | provider-item-id | external-id`) |
| `storage.ts` | `StorageRecord` — `root`, `path?: Record<string,string>` |
| `game.ts` | `GameRecord` — legacy; `system`, `contentPath|content.artifactId`, `metadata`, `launch`, `launcher`, `core`, `collections`, `presets`, `byLauncher`; inheritable fields |
| `module.ts` | `ModuleRecord` — `kind: "libretro-core"`, `path` |

### Source-target resolution
`product/platform/library/config/source-target-resolution.ts` — `resolveReleaseTarget`, `ReleaseTargetAtom` (`string | UriTarget | FileTarget`). Only `string`, `{ kind: "uri" }`, and `{ kind: "file", storage, path }` are currently resolved. Array targets (`MultiTargetUnsupported`) and everything else fall through to `String(target)`.

### Materializers (plugin-owned)
Plugins that need config-file generation or multi-step spawn prep expose a `ReadableLaunchIntegration`:
```ts
interface ReadableLaunchIntegration {
  providerId?: PluginId
  kind: string                       // matched against appRecordKind(context.app)
  integration: AppIntegrationKind
  canResolve: (ctx: ReadableResolvedLaunchContext) => boolean
  materialize: (ctx, opts?) => Effect<{ spec, artifacts?, diagnostics? }, ResolutionError>
}
```
Registered in `product/plugins/index.ts` as `firstPartyLaunchIntegrations`:
- `retroarchReadableLaunchIntegration` (kind `"@korri:retroarch"`)
- `ryubingReadableLaunchIntegration`
- `steamReadableLaunchIntegration`
- `threeDSenReadableLaunchIntegration`

### Existing tests (migration-sensitive)
| File | What it gates |
|------|---------------|
| `product/platform/library/config/records/readable-schema.test.ts` | Decodes every record type; rejects retired vocabulary; validates fixture YAML |
| `product/platform/library/config/cascade-resolver.test.ts` | `resolveLocalLauncherCompanionPolicy` fold rules |
| `product/platform/library/config/readable-cascade-resolver.test.ts` | Full readable cascade integration (1000+ lines) |
| `product/platform/library/config/compose-readable-launch-spec.test.ts` | Placeholder substitution |
| `product/platform/library/config/authoring/examples.test.ts` | Parses `korri-catalog-display-metadata.example.yaml`; checks retired vocabulary list; validates Steam and RetroArch example YAML files |
| `product/plugins/retroarch/src/plugin.test.ts` | Retroarch plugin descriptor |
| `product/plugins/retroarch/src/materializer.test.ts` | Retroarch materializer |
| `product/plugins/steam/src/plugin.test.ts` | Steam plugin descriptor |
| `product/platform/plugin/registry.test.ts` | Registry merging and namespacing |

---

## Implementation Patterns

### Pattern 1 — Schema record anatomy (Effect Schema v4)
Every record module follows:
```ts
export const FooPayload = Schema.Struct({ ... })  // no id field
export type FooPayload = Schema.Schema.Type<typeof FooPayload>

export const FooRecord = Schema.Struct({ id: ..., ...FooPayload.fields })
export type FooRecord = Schema.Schema.Type<typeof FooRecord>

export const decodeFooPayload = (input: unknown): FooPayload =>
  Schema.decodeUnknownSync(FooPayload)(input, { onExcessProperty: "error" })
export const decodeFooRecord = ...
```
`onExcessProperty: "error"` is enforced everywhere — unknown keys **fail loudly at decode time**. This is the central guard against silent field typos.

### Pattern 2 — `plugin()` factory / descriptor
```ts
export const myPlugin = plugin({
  namespace: "@korri",
  name: "my-plugin",
  title: "...",
  description: "...",
  requires: [...],
  contributes: {
    config: {
      apps: { localId: { id: "...", kind: "@korri:my-plugin", command: "...", ... } },
      systems: { localId: { id: "...", title: "...", apps: [...] } },
      runtimes: { localId: { kind: "libretro-core", path: "...", app: "...", ... } },
      modules: { localId: { id: "...", kind: "...", capabilities: [...] } },
      catalog: { localId: { id: "...", title: "...", kind: "game", releases: [...] } },
    },
    handlers: [{ id: "...", operation: "...", capabilities: [...], run: ctx => ... }],
  },
})
```
- Registry namespaces all `config.*` contributions (except `providers`) as `<plugin-id>/<local-id>`.
- The `plugin()` helper auto-creates a `providers[<plugin-id>]` entry with `{ title, description }`.
- Config contributions loaded by `loadReadableSnapshot` → `pluginReadableRecords` → `decodePluginReadableMap` (silent-skip on decode failure).

### Pattern 3 — `AppRecord.kind` is the integration discriminator
`app.kind` currently drives `ReadableLaunchIntegration` selection via `appRecordKind(context.app)`. Provider-qualified kinds (`kind.startsWith("@")`) fall through to the `findReadableLaunchIntegration` path; unqualified kinds use built-in integration names (`mame`, `dolphin`, `solarus`, `generic-process`).

### Pattern 4 — Plugin policy via `plugin: { "@korri:foo": { ... } }`
Plugin-specific typed settings travel in `plugin.<provider-id>` maps at every inheritable layer. They are decoded/validated in each plugin's materializer (e.g. `decodeRetroArchPolicy` in `retroarch/src/policy.ts`, `SteamPluginPolicy` in `steam/src/plugin.ts`). The cascade merges them as deep-merge objects (arrays concat; scalars last-win).

### Pattern 5 — `argsAppend`, `env`, `cwd`, `patches` as inheritable scalars
Concat (argsAppend, patches) or last-win (env, cwd) across the cascade. `moonlight` is deep-merged with special cases for `extraArgs` and `input.devices` (concat).

### Pattern 6 — `launch.with` companion map
Provider-keyed, deep-merged. Used for Gamescope (`@korri:gamescope`), Moonlight (`launch.with.<moonlightProvider>`), and extension points. The cascade exports it as `launchCompanions` on `ReadableResolvedLaunchContext`.

### Pattern 7 — Fixture YAML format
Existing readable library fixture format (enforced by `readable-schema.test.ts` + `examples.test.ts`):
```yaml
storage:         # StorageRecord map
systems:         # SystemRecord map (apps[], cores, inheritable fields)
apps:            # AppRecord map (kind, command, args, runtime, plugin.*, launch.with.*)
runtimes:        # RuntimeRecord map (kind, path, tool, app, supports.systems[])
library:         # LibraryItemRecord map (releases[{ id, system, target, apps[{id, runtime}] }])
providers:       # ProviderRecord map
sources:         # SourceRecord map (deprecated, still parsed)
```

### Pattern 8 — Retired vocabulary enforcement
Multiple records already enforce deprecations at decode time with `Schema.check(Schema.makeFilter(...))` returning issue objects. For example:
- `LibraryReleasePayload` rejects `source`, `app`, `runtime` at the release level.
- `SystemPayload` rejects `launcher` field.
- `AppPayload` rejects `kind: "steam"`, `retroarch`, `integration`, `netplay`, `remoteCommand`, `achievements.password`.
- `ModuleRecord` still used in legacy code paths but `upsertModule` in repository is deprecated.

### Pattern 9 — `ReadableLaunchIntegration` + materializer pattern
Plugin materializers receive `ReadableResolvedLaunchContext` (the fully merged cascade output) and are responsible for:
1. Deciding `canResolve(context)` — checks plugin policy decodable, runtime kind compatible, content path available.
2. Generating `materialize(context, opts)` — writes config files to an artifact root, composes `LaunchSpec`.
3. Returning `{ spec, artifacts?, diagnostics? }`.

### Pattern 10 — `ProviderLinkRecord` (current shape)
```ts
{ id, provider, playable, release?, ref: { kind: "url|provider-item-id|external-id", value } }
```
One ref per record (not an array). The sketch proposes changing to `refs[]` per link.

---

## Current Domain Model vs New Domain Model

### What exists today (migration FROM)

| Concept | Current representation | Location |
|---------|----------------------|----------|
| Launcher | `LauncherRecord` (`command`, `args`, `systems`); also `AppRecord` with `kind: "..."` | `records/launcher.ts`, `records/app.ts` |
| App choice | `release.apps[]: AppChoice` — `id` references a top-level `AppRecord` | `records/app-choice.ts` |
| Runtime | `RuntimeRecord` (`kind: libretro-core|tool|emulator`, `path`, `app`, `supports.systems[]`) | `records/runtime.ts` |
| System default launch | `system.apps[{ id, runtime }]` overrides; `system.cores` legacy | `records/system.ts` |
| Target | `release.target`: `string | { kind: "file", storage, path } | { kind: "uri", value }` (array variant exists but `MultiTargetUnsupported`) | `records/library-item.ts`, `source-target-resolution.ts` |
| Provider identity | `ProviderLinkRecord` — one `ref` per record | `records/provider-link.ts` |
| Settings | Flat `LaunchSettings` on `AppRecord`; `plugin.<id>` map for plugin-specific settings | `launch-block.ts`, `inheritable-fields.ts` |
| Systems metadata | `name`, `manufacturer` on `SystemRecord`; no concept of metadata-only vs launchable | `records/system.ts` |
| Plugin descriptor | `contributes.config.apps`, `.runtimes`, `.systems`, `.modules`, `.catalog` | `product/platform/plugin/index.ts` |

### What the sketch proposes (migration TO)

| New concept | Description |
|-------------|-------------|
| `target` | Vocabulary expansion: `kind: file \| file-set \| executable \| url \| provider-ref` |
| `file-set` target | `{ kind: "file-set", storage, root, files: [{ id, role, label?, path }] }` — named parts with roles (`manifest \| media \| data \| ...`) |
| `executable` target | `{ kind: "executable", path }` — implies `@korri:process` launcher inference |
| `provider-ref` target | `{ kind: "provider-ref", provider, ref }` — for nixpkgs, Steam, etc. |
| `launchers` (top-level) | Named reusable launcher instances: `plugin`, optional `runtime`, `input`, `settings`, `env`, `cwd`, `with`, `overrides` |
| `launch` on release | Optional overlay with same vocabulary as a named launcher (minus `plugin`/`use`); can be omitted when system/provider implies a single launcher |
| `use` in launch | References a named launcher by name |
| `plugin` in launch | Selects a plugin-provided launcher implementation |
| `settings` split | Common normalized packs: `display`, `audio`, `input`, `saves`, `lifecycle`; plus `settings.plugin` (typed by selected launcher plugin) |
| `overrides` | Raw escape hatch: `overrides.args.append[]`, `overrides.config.append` |
| `systems` metadata-only | Systems contain only `title`, `aliases[]`, `metadata {}` — no launcher config, no `apps[]`, no `cores` |
| Plugin descriptor additions | `runtimeMode: none \| embedded \| optional \| required`; `supportedSettingPacks[]`; system support mappings (separate from `systems`) |
| `provider-links` | Named records scoped to playable+release+targetPart; `refs[]` (array of `{ kind, value }`) |
| `runtimes` | Survive; `kind: libretro-core`, `path`, `supports.systems[]`; still `plugin`-owned |
| `input` on launcher | Selects which file-set part to pass (`roles: [manifest, media]` fallback policy, or `part: <id>` exact) |

---

## Issue Conventions

*(GitHub issues not examined — out of scope for this research.)*

---

## Documentation Insights

### Contribution guidelines (`product/plugins/AGENTS.md`)
- Every plugin: `index.ts` (thin export surface) + `src/plugin.ts` (descriptor).
- Use `plugin()` from `@platform/plugin`.
- Config contributions: `providers`, `providerLinks`, `storage`, `systems`, `apps`, `modules`, `runtimes`, `profiles`, `catalog`.
- Other config maps are namespaced by registry as `<plugin-id>/<local-id>`.
- Catalog + `modules` for plugin-contributed executables.
- Handlers must validate `context.input` at the boundary.
- Register in `product/plugins/index.ts` `firstPartyPlugins` array.
- Tests required: stable plugin id, descriptor contributions, handler ops, input validation, registry exposure, launch/catalog/resource behavior.
- **Do not** use `PATH` for host capabilities; do not add `Mock*`/`Stub*`/`Fake*`; do not mutate user Nix profiles; do not use `nix run` at launch time.

### Key authoring rules
- Schema decodes in `{ onExcessProperty: "error" }` — unknown keys fail loudly.
- `app.kind` = discriminator; must be a valid `AppKind` or provider-qualified string.
- `release.apps[].kind` is rejected; `kind` lives only on top-level `AppRecord`.
- `release.target` must not be an absolute path.
- `release.app`, `release.runtime` (top-level on release, not inside `apps[]`) are retired and rejected.
- `system.launcher` is rejected; use `system.apps[]`.
- Retired: `source` records, `module` records, `GameRecord` directly, `launcher`/`core` shorthand aliases.
- `plugin.<provider-id>` values are `unknown` at the inheritable-field level but decoded by each plugin's materializer.

### Testing conventions
- Test files colocated: `src/<feature>.test.ts` or `src/<feature>/<unit>.test.ts`.
- Unit tests use `bun:test` (`describe`, `it`, `expect`).
- Integration/e2e use Playwright.
- No `Mock*`, `Stub*`, `Fake*` prefixes; doubles use real implementations with configurable behavior.
- `Effect.runPromise` / `Effect.runSyncExit` / `Effect.runPromiseExit` for testing Effect pipelines.

---

## Templates Found

No `.github/ISSUE_TEMPLATE/` or PR template files found in scope. Config YAML fixtures serve as the primary authoring templates:
- `product/platform/library/config/fixtures/steam-full.korri.yaml` — authoritative readable library fixture
- `docs/brainstorms/2026-06-11-001-steam-readable-library-example.korri.yaml` — Steam readable library example
- `docs/brainstorms/2026-06-08-004-retroarch-policy-minimal-v1.example.yaml` — RetroArch minimal policy example
- `docs/brainstorms/2026-06-08-003-retroarch-policy-one-to-one.example.yaml` — RetroArch one-to-one policy example
- `work/items/active/01KVGDKT01DNT9NRDKS846CJQ1-plugin-launcher-standardization/config-sketch.korri.yaml` — the new domain model sketch (source of truth for this refactor)

---

## Recommendations for the Big-Bang Refactor

### Files/modules to replace (core schema layer)

| File | Current role | New role / disposition |
|------|-------------|----------------------|
| `records/library-item.ts` | `LibraryReleasePayload.target`: `string\|UriTarget\|FileTarget\|Array` | Expand to `FileTarget\|FileSetTarget\|ExecutableTarget\|ProviderRefTarget\|UrlTarget`; remove `apps[]` referencing `AppRecord`; add `launch` overlay block |
| `records/system.ts` | Carries `apps[]`, `cores`, `byLauncher`, `launch`, cascade fields | Strip to metadata-only: `title`, `aliases[]`, `metadata {}`. Remove `apps[]`, `cores`, `name`, `manufacturer`, `byLauncher`, `presets`, all inheritable fields |
| `records/app.ts` | `AppRecord` — used as current "launcher" concept | Rename concept to `LauncherRecord` (new shape); keep existing `AppRecord` removed or archived |
| `records/launcher.ts` | Legacy `LauncherRecord` with `command`, `args`, `systems` | Replace: new `LauncherRecord` has `plugin\|use`, `runtime?`, `input?`, `settings`, `env`, `cwd`, `with`, `overrides` |
| `records/app-choice.ts` | `AppChoice` — `id` pointing to `AppRecord` | Remove; launch selection now lives in `launch.use` or system-level plugin support mappings |
| `records/runtime.ts` | `RuntimeRecord` — `kind`, `path`, `app`, `supports.systems[]` | Retain; update `supports.systems[]` to work with new system IDs; remove `app` field (launcher relationship declared in plugin support records) |
| `records/provider-link.ts` | Single `ref: { kind, value }` per record | Change to `refs: Array<{ kind, value }>` per record; add `targetPart?` scope |
| `records/global.ts` | `launch.app` + legacy `launcher` | Replace with `launch.use\|plugin` vocabulary |
| `launch-block.ts` | `LaunchBlock` — `app`, `module`, `settings`, `with`, `args`, `env`, `cwd` | Replace with new launcher overlay block: `plugin?`, `use?`, `runtime?`, `input?`, `settings: { display?, audio?, input?, saves?, lifecycle?, plugin? }`, `env`, `cwd`, `with`, `overrides` |
| `inheritable-fields.ts` | `InheritableLayer` whitelist | Rebuild around new overlay vocabulary; remove `launch.app`, `launch.module`; add `launch.use`, `launch.plugin`, common settings packs |
| `cascade-resolver.ts` | 7-layer fold; skeleton launcher resolution; `apps` lookup; `byLauncher` merging | Rewrite around launcher-resolution: `target.kind` → infer launcher → apply `launch` overlay; remove `apps` map from snapshot; remove `byLauncher` |
| `app-integrations.ts` | `AppDescriptor`, built-in apps dict, `integrationForKind` | Replaced by plugin descriptor `runtimeMode` + `supportedSettingPacks` + support mappings; materializer dispatch moves to plugin registry lookup |
| `app-materializer.ts` | Switch on `integration` string for mame/dolphin/solarus | Remove; every materializer is plugin-owned via `ReadableLaunchIntegration` |
| `app-choice-selection.ts` | `selectAppChoice`, `resolveEffectiveAppChoices` | Remove; app/launcher selection logic moves to `launch.use` + plugin support record join |
| `source-target-resolution.ts` | `resolveReleaseTarget` — `string\|UriTarget\|FileTarget` | Extend: `ExecutableTarget`, `ProviderRefTarget`, `UrlTarget`, `FileSetTarget` + `input` selection policy |
| `resolved-launch-context.ts` | `ReadableResolvedLaunchContext` — `app: AppRecord`, `runtime?: RuntimeRecord` | Replace `app` with `launcher: { plugin, use?, resolved }`, `runtime?: RuntimeRecord`, `target: ResolvedTarget`, `input?: ResolvedInput` |

### Plugin descriptor additions needed

Each plugin must declare new metadata fields (new schema in `product/platform/plugin/index.ts`):
```ts
interface PluginLauncherDescriptor {
  // What the plugin provides as a launcher implementation
  runtimeMode: "none" | "embedded" | "optional" | "required"
  supportedSettingPacks?: Array<"display" | "audio" | "input" | "saves" | "lifecycle">
  // system support mappings contributed additively to the registry
  systemSupport?: Array<{ system: string; runtimeKind?: string }>
}
```

### First-party plugin changes needed

| Plugin | Current config contribution | Change needed |
|--------|---------------------------|---------------|
| `@korri:retroarch` | `apps.retroarch`: `kind: "@korri:retroarch"`, `args` template; `systems.*: { apps: [{ id, runtime }] }` | Convert to `launchers.retroarch: { plugin: "@korri:retroarch", ... }`; `runtimeMode: "required"`; system support records separate from `systems` map |
| `@korri:steam` | `apps.steam`: `kind: "@korri:steam"`, `systems.steam: { apps: [{ id: steam }] }` | Convert to `launchers.steam: { plugin: "@korri:steam", ... }`; `runtimeMode: "optional"` (compat tool); target `provider-ref` implies launcher |
| `@korri:zquest-classic` (new) | N/A | New plugin; `runtimeMode: "embedded"` |
| `@korri:nixpkgs` (new or process) | `neverball` uses `catalog.neverball.releases[].launch.executable.resource` | Convert to `target: { kind: "provider-ref", provider: "@korri:nixpkgs", ref: "nixpkgs#neverball" }` |
| `@korri:process` (implicit/new) | Generic `kind: "process"` / `generic-process` integration | Formalize as `runtimeMode: "none"`, handles `target.kind: "executable"` by default |

### Common settings packs schema (new)

```ts
// New in inheritable-fields.ts or new file settings-packs.ts
const DisplaySettings = Schema.Struct({
  fullscreen: Schema.optional(Schema.Boolean),
  integerScale: Schema.optional(Schema.Boolean),
  vsync: Schema.optional(Schema.Boolean),
  throttleFps: Schema.optional(Schema.Boolean),
})
const AudioSettings = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
})
const InputSettings = Schema.Struct({ ... })
const SavesSettings = Schema.Struct({
  directory: Schema.optional(Schema.String),
  stateDirectory: Schema.optional(Schema.String),
})
const LifecycleSettings = Schema.Struct({
  gameMode: Schema.optional(Schema.Boolean),
})
const LauncherSettings = Schema.Struct({
  display: Schema.optional(DisplaySettings),
  audio: Schema.optional(AudioSettings),
  input: Schema.optional(InputSettings),
  saves: Schema.optional(SavesSettings),
  lifecycle: Schema.optional(LifecycleSettings),
  plugin: Schema.optional(Schema.Unknown), // typed by selected launcher plugin
})
```

### `ProviderLinkRecord` changes

Current: `{ id, provider, playable, release?, ref: { kind, value } }`
New: `{ id, provider, playable, release?, targetPart?, refs: Array<{ kind, value }> }`

`ProviderRef.kind` must be expanded: currently `"url | provider-item-id | external-id"`. The sketch uses `sha1`, `md5`, `serial` — those would be new values under `kind`.

### `FileSetTarget` schema (new)

```ts
const FileSetFile = Schema.Struct({
  id: NonEmptyString,
  role: FileSetFileRole,  // "manifest" | "media" | "data" | "patch" | "metadata" | "document"
  label: Schema.optional(Schema.String),
  path: TargetRelativePath,
})

const FileSetTarget = Schema.Struct({
  kind: Schema.Literal("file-set"),
  storage: NonEmptyString,
  root: TargetRelativePath,
  files: Schema.Array(FileSetFile).check(/* at least one */),
})
```

### `LaunchInputPolicy` (new — maps to file-set input selection)

```ts
const LaunchInputPolicy = Schema.Struct({
  roles: Schema.optional(Schema.Array(FileSetFileRole)),  // ordered fallback
  part: Schema.optional(NonEmptyString),                  // exact part id override
})
```

### `LauncherOverlay` (new — the unified launcher object for `launchers.*`, `launch` on release, plugin support records)

```ts
const LauncherOverlay = Schema.Struct({
  plugin: Schema.optional(PluginId),   // required in top-level launchers definitions
  use: Schema.optional(Schema.String), // references a named launcher
  runtime: Schema.optional(Schema.String),
  input: Schema.optional(LaunchInputPolicy),
  settings: Schema.optional(LauncherSettings),
  env: Schema.optional(EnvMap),
  cwd: Schema.optional(Schema.String),
  with: Schema.optional(LaunchWithPolicy),
  overrides: Schema.optional(LauncherOverrides),
})

const LauncherOverrides = Schema.Struct({
  args: Schema.optional(Schema.Struct({
    append: Schema.optional(Schema.Array(Schema.String)),
  })),
  config: Schema.optional(Schema.Struct({
    append: Schema.optional(Schema.String),
  })),
})
```

### Cascade / resolver rewrite

The `ReadableConfigSnapshot` loses `apps`, gains `launchers` (named launcher records). System lookup for launch defaults changes from `system.apps[]` to a plugin support record join:

```ts
// New snapshot
interface ReadableConfigSnapshot {
  host: HostRecord | null
  users: Map<string, UserRecord>
  systems: Map<string, SystemRecord>      // metadata-only
  launchers: Map<string, LauncherRecord>  // new shape
  runtimes: Map<string, RuntimeRecord>    // unchanged
  storage: Map<string, StorageRecord>
  library: Map<string, LibraryItemRecord>
  profiles: Map<string, ProfileRecord>
  // removed: apps, sources
}
```

Launch resolution algorithm:
1. Determine `target.kind` from release.
2. If `release.launch.use`: look up named launcher.
3. If `release.launch.plugin`: use plugin directly.
4. Else infer from `target.kind` + `target.provider` (provider-ref → provider implies launcher; executable → `@korri:process`; file/file-set → join plugin support records for `release.system`).
5. Merge `launch` overlay onto resolved launcher settings.

### `ReadableResolvedLaunchContext` new shape

```ts
interface ReadableResolvedLaunchContext {
  playableId: string
  itemId: string
  containedId?: string
  releaseId: string
  system: string
  target: ResolvedTarget          // discriminated union of target kinds
  launcher: {
    pluginId: PluginId
    record?: LauncherRecord       // the named launcher if used
    runtimeMode: "none"|"embedded"|"optional"|"required"
  }
  runtime?: RuntimeRecord
  input?: ResolvedInput           // which file-set part / path was selected
  settings?: ResolvedLauncherSettings  // common packs merged + plugin settings merged
  launchCompanions?: LaunchCompanionMap
  moonlight?: MoonlightPolicy
  plugin?: PluginPolicyMap
  env?: Record<string, string>
  cwd?: string
  argsAppend?: string[]
  patches?: string[]
  storage: Record<string, StorageRecord>
}
```

### Test files to rewrite (migration-sensitive)

| File | Reason |
|------|--------|
| `readable-schema.test.ts` | Every record shape changes; retired vocabulary list expands |
| `readable-cascade-resolver.test.ts` | Cascade fold algorithm changes; `apps` map removed; `launchers` map replaces |
| `cascade-resolver.test.ts` | `resolveLocalLauncherPolicy` still needed; `byLauncher` behaviour changes |
| `compose-readable-launch-spec.test.ts` | Placeholder vocabulary changes; `{runtime.path}`, `{content.path}` survive; `{target}`, `{target.url}` are new |
| `authoring/examples.test.ts` | Example YAML files need to be updated to new grammar; forbidden vocabulary list expands |
| `product/plugins/retroarch/src/plugin.test.ts` | Plugin contributes `launchers` instead of `apps`; system support records change |
| `product/plugins/steam/src/plugin.test.ts` | Same |
| `product/platform/plugin/registry.test.ts` | `PluginRegistry` gains `launchers` map; loses `apps` map |

### Critical API surface (no-backwards-compat breakage points)

1. **`LibraryReleasePayload.target`** — type union expands; `apps[]` removed from release; `system` may become optional (inferred from target).
2. **`SystemRecord`** — stripped to metadata; `apps[]`, `cores`, inheritable fields removed.
3. **`LauncherRecord`** (renamed from `AppRecord`) — completely different shape.
4. **`AppRecord`** — removed or archive-only.
5. **`PluginConfigContributions`** — `apps` removed; `launchers` added; plugin descriptor gains `runtimeMode`, `supportedSettingPacks`.
6. **`ReadableConfigSnapshot`** — `apps` removed; `launchers` added.
7. **`ReadableResolvedLaunchContext`** — `app: AppRecord` replaced by `launcher: { pluginId, record?, runtimeMode }`.
8. **`ReadableLaunchIntegration.kind`** — still matched against launcher plugin id (was matched against `appRecordKind`); API stays but plugin ids change.
9. **`ProviderLinkRecord`** — `ref` single → `refs[]` array; `targetPart?` added.
10. **`LaunchBlock`** — `app`, `module` fields removed; new `use`, `plugin`, `runtime`, `input`, `settings.plugin` fields added.
11. **`InheritableLayer`** — inheritable fields restructured around new `launch` vocabulary.
12. **`PluginCatalogRelease.launch`** — `kind: "process"`, `executable: { resource }` stays or converts to new target vocabulary.
