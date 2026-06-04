# Repository Research: Bazzar → Korri Migration
<!-- Origin: docs/brainstorms/2026-06-01-001-bazzar-source-adapter-download-resolution-requirements.md -->

---

## Technology & Infrastructure

### Korri

- **Language / runtime:** TypeScript (strict), Bun 1.x
- **Major frameworks:** React 19 + Vite (portal), Effect v4 (runtime), Hono (API server), TanStack Router (portal)
- **CLI runtime:** `effect/unstable/cli` (`Command`, `Flag`, `Argument`) + `@effect/platform-bun`
- **Formatting / linting:** Biome 2.x (2-space, double-quote, semicolons-as-needed)
- **Testing:** `bun test` (`bun:test`) for unit; Playwright for E2E and component
- **Deployment model:** Nix flakes — each app/service is a separate `mkDerivation` producing a fully-bundled self-contained Bun JS file wrapped with `makeWrapper`
- **Path aliases:** `@platform/*` → `product/platform/*`, `@product/*` → `product/*`
- **Monorepo shape:** Not a workspace monorepo; one `package.json` / `bun.lock` at the root, one TypeScript compilation target per `tsconfig*.json` variant

### Bazzar

- **Language / runtime:** TypeScript (strict), Bun 1.x
- **Major frameworks:** Effect v4 (same beta version as Korri), `effect/unstable/cli`, `@effect/platform-bun`
- **HTTP / HTML parsing:** `ky` (HTTP), `cheerio` (HTML)
- **Logging:** `pino` → stderr (standalone, no pino-pretty transport worker in production bundles)
- **Filter engine:** `@bufbuild/cel` + `@bufbuild/protobuf`
- **Cursor hashing:** `bs58`
- **API surface (excluded):** tRPC + Fastify + React (`apps/api/`, `apps/ui/`) — dev/demo only
- **Nix packaging:** `nix/bazzar-cli.nix` — expects `dist/bazzar.js` pre-built; simpler than Korri's pattern

### New Korri Dependencies Needed

None of the following are currently in `bun.lock` / `package.json`:

| Package | Bazzar role | Required by |
|---|---|---|
| `ky` | HTTP client inside plugin runtime | `plugin-runtime.ts` |
| `cheerio` | HTML parsing in plugin context | `plugin-runtime.ts` |
| `@bufbuild/cel` | CEL filter evaluation | `utils/filters.ts` |
| `@bufbuild/protobuf` | CEL dependency | `utils/filters.ts` |
| `bs58` | Cursor hashing | `utils/cursor.ts` |

`pino` and `pino-pretty` are already Korri production deps.

---

## Architecture & Structure

### Korri Product Boundaries

```
product/
  apps/
    cli/          ← public operator surface; one .nix + one build entry
    portal/       ← browser SPA
    desktop/      ← Electrobun wrapper
    storybook/    ← visual harness
  platform/       ← shared runtime; no product-specific imports allowed
    api/rpc/      ← Effect RPC helpers, envelope guard, typed errors
    library/      ← LibrarySource, Launcher, GameRecord — known-playable-library model
    logger/       ← pino wrapper (index.ts exports `logger`, `createLogger`)
    config/       ← environment.ts, xdg-paths.ts
    fixtures/     ← ResolvedGameRecord schema and fixture data
    utils/        ← pure helpers (array, comparators, string-transformers, …)
    … (browser/, input/, react/, theme/, ui/, stream/, protocol/, …)
  services/
    device/       ← sessiond, game-stream, inputd — device-side runtime
    server/       ← korri-api (Hono HTTP server)
  systems/
    nixos/        ← NixOS module definitions, system compositions
    rocknix/      ← ROCKNIX overlay
  themes/
  vendor/         ← downstream-patched third-party binaries
```

**AGENTS.md rule:** `@platform/*` code must not import `@product/*` or any `product/apps/*` / `product/services/*` internals.

### Korri CLI Architecture (`product/apps/cli/`)

**Entry point:** `korri-cli.ts` — exports `korriCommand` and `runKorriCli(argv)`.

```ts
// Pattern for every command group
const streamLaunchCommand = Command.make("launch", { ...args }, handler)
  .pipe(Command.withDescription("…"))

const streamCommand = Command.make("stream")
  .pipe(Command.withDescription("…"))
  .pipe(Command.withSubcommands([streamLaunchCommand, streamRemoteLaunchCommand]))

export const korriCommand = Command.make("korri")
  .pipe(Command.withDescription("Korri command line interface."))
  .pipe(Command.withSubcommands([playCommand, streamCommand]))

const runtimeLayer = Layer.mergeAll(BunServices.layer, LibrarySourceLayerLive, LauncherLayerLive)

export function runKorriCli(argv: readonly string[]) {
  return Command.runWith(korriCommand, { version: VERSION })(argv).pipe(
    Effect.provide(runtimeLayer),
  )
}
```

**Test pattern (`korri-cli.test.ts`):**
```ts
const exit = await Effect.runPromiseExit(runKorriCli(["stream", "launch", "--help"]))
expect(Exit.isSuccess(exit)).toBe(true)
```
Tests call `runKorriCli` in-process; no subprocess spawn needed for help/routing tests.

**Nix build (`product/apps/cli/package.nix`):**
- `bun build product/apps/cli/korri-cli.ts --target=bun --outfile=korri-cli.js`
- Wrapped: `makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri" --add-flags "…/korri-cli.js"`
- Source set in `flake.nix`: `cli = mkSource ([ ./product/apps/cli ] ++ deviceRuntime)` where `deviceRuntime` includes `./product/platform`
- Any new code landing in `product/apps/cli/` or `product/platform/` is automatically included in the `cli` source set.
- Install check: `"$out/bin/korri" --version >/dev/null`

**Nix module (`product/systems/nixos/modules/korri-cli.nix`):**
Sets `environment.systemPackages = [ cfg.package ]`. Adding `korri bazzar` to the CLI binary automatically provisions it on any NixOS system that enables `services.korri.cli`.

### Korri Effect Service Pattern

Services in `product/platform/`:
```ts
// Declaration
export class LibrarySource extends Context.Service<LibrarySource, LibrarySourceService>()(
  "LibrarySource",
) {}

// Layer naming: <Service>Layer<Variant>
export const LibrarySourceLayerLive: Layer.Layer<LibrarySource, …> = …
export const LibrarySourceLayerMemory: Layer.Layer<LibrarySource, …> = …
```

Errors use `Schema.TaggedErrorClass`:
```ts
export class LibraryError extends Schema.TaggedErrorClass<LibraryError>()(
  "LibraryError",
  { reason: Schema.Literals(["io", "unavailable", "config"]), … },
) {}
```

### Bazzar Core Architecture

```
Bazzar:apps/cli/src/
  bazzar.ts                     ← root Command, version "2.0.0"
  cli-commands.ts               ← search/details/plugins handlers (human output)
  source-contract-commands.ts   ← validate-sources/resolve-download (machine envelopes)
  source-contract-runner.ts     ← envelope execution, stdout/stderr discipline, exit codes
  source-contract-services.ts   ← SourceContractConfiguration, SourceValidation, DownloadResolution services
  plugin-environment.ts         ← PluginEnvironment, PluginDirectory services
  cli-runtime-services.ts       ← CliLogging service (pino init to stderr)
  __fixtures__/plugins/         ← hermetic .mjs test plugins + .validation.ts probes

Bazzar:shared/core/src/
  plugin-runtime.ts             ← PluginRuntime: HTTP (ky), rate limiter, credentials, cache
  plugin-loader.ts              ← discover/import/validate .mjs plugins → PluginInventory
  plugin-operation-harness.ts   ← timeout, canonicalization, PluginOperationError
  plugin-contract-codecs.ts     ← Effect Schema for search/details/meta plugin outputs
  plugin-cache.ts               ← Bazzar-owned in-memory cache (no TanStack Query)
  plugin-execution-policy.ts    ← credentials, rate limits, timeout policy
  source-search.ts              ← fan-out search over plugins, streaming chunks
  source-details.ts             ← single-URL details via matching plugin
  source-identity.ts            ← canonical SourceIdentity, canonicalize helpers
  source-aliases.ts             ← itchio-bitsy → itchio alias map
  source-policy.ts              ← load .policy.ts files → allowed hosts for resolution
  source-validation-probes.ts   ← load .validation.ts files → probe registry
  clock.ts                      ← injectable BazzarClock (system / fixed / now-fn)
  errors.ts                     ← PluginLoadError, PluginValidationError, HttpError, ParseError
  logger.ts                     ← pino proxy, always stderr, lazy init
  runtime-config.ts             ← BAZZAR_* env vars, BazzarRuntimeConfig (includes api.* section)
  platform-catalog.ts           ← PlatformCatalog, RETROARCH_PLATFORM_MAPPING (150+ platforms)
  platform-mapping.ts           ← mapping helpers
  security/credential-redaction.ts  ← strip credential values from error messages
  utils/filters.ts              ← CEL filter parse/validate/execute
  utils/cursor.ts               ← pagination cursor encode/decode, hash
  utils/streaming.ts            ← streaming search result assembly
  utils/game-grouping.ts        ← groupId generation
  cli/output-contract.ts        ← BazzarCliEnvelope, exit codes, serialize/validate
  types/plugin-types.d.ts       ← SourceCandidate, SourceCandidateDetails, Plugin, PluginRuntime, …
  types/source-health-types.ts  ← SourceHealthOutcome ADT (7 status variants)
  types/download-resolution-types.ts ← DownloadResolutionOutcome ADT (10 status variants)
  types/source-outcome-codecs.ts ← Effect Schema for health + resolution, sensitive-key filter
  rpc/bazzar-rpc.ts             ← createBazzarSourceRpc — Effect-based RPC surface, Schema-validated
  validation/source-validation.ts ← probe-based health checking (async)
  download-resolution/download-resolution.ts ← resolveDownload (async)
  download-resolution/url-policy.ts ← UrlPolicyError, assertSafeResolutionUrl
  plugins/                      ← first-party .mjs plugins, each with .policy.ts and .test.ts;
                                   some also have .validation.ts and .mocks.ts
```

---

## Issue Conventions

No GitHub issue templates found in `.github/`. Planning and requirements live in `docs/brainstorms/` (this migration's origin). No label conventions were inspectable from this research scope.

---

## Documentation Insights

**Korri (`AGENTS.md`):**
- "Read before you touch." and "Read a nearby similar feature/domain first."
- "Never create documentation, report, or summary Markdown files unless explicitly requested."
- `@platform/*` must not import `@product/*`.
- Autonomous themes must not import `product/apps/*`, `product/services/*`.
- All doc shapes are project-specific; job docs → `docs/jobs/*.md`, feature briefs → `product/apps/portal/features/<feature>/brief.md`.

**Bazzar (`CLAUDE.md`):**
- Machine-readable contract commands emit exactly one `bazzar.source-adapter.v1` JSON envelope on stdout.
- Logs and diagnostics MUST stay on stderr.
- `BAZZAR_PLUGINS_DIR` is the canonical plugin-directory env var.
- `apps/api` and `apps/ui` are explicitly non-canonical dev/demo surfaces.
- `shared/core/src/rpc/bazzar-rpc.ts` is the intended future RPC integration seam.

---

## Templates Found

No `.github/ISSUE_TEMPLATE/` or PR template files found in either repo. Backlog items follow the pattern in `backlog/` — see existing backlog files for conventions.

---

## Implementation Patterns

### CLI Command Registration Pattern (Korri)

File: `product/apps/cli/korri-cli.ts`

```ts
// 1. Leaf command
const leafCommand = Command.make(
  "subcommand-name",
  { arg: Argument.string("name"), flag: Flag.string("flag").pipe(Flag.optional) },
  ({ arg, flag }) => Effect.gen(function* () { … })
).pipe(Command.withDescription("…"))

// 2. Group command (no own handler)
const groupCommand = Command.make("group")
  .pipe(Command.withDescription("…"))
  .pipe(Command.withSubcommands([leafA, leafB]))

// 3. Root registration
export const korriCommand = Command.make("korri")
  .pipe(Command.withSubcommands([existingCmd, newGroupCommand]))

// 4. Runtime layer must include all services the group's handlers yield*
const runtimeLayer = Layer.mergeAll(BunServices.layer, …)
```

The new `bazzarCommand` group follows steps 1–3. Because acquisition commands do not use `LibrarySource` or `Launcher`, they do not add to `runtimeLayer`. The acquisition services are provided via their own layer inside each command handler or via a dedicated `bazzarRuntimeLayer`.

### Effect Service + Layer Pattern (Korri/Bazzar aligned)

```ts
// Service declaration (Bazzar style, already Lattice-aligned)
export class SourceValidation extends Context.Service<
  SourceValidation,
  SourceValidationService
>()("bazzar/SourceValidation") {}   // ← rename to "korri/acquisition/SourceValidation"

// Live layer
export const SourceValidationLive = Layer.succeed(SourceValidation, {
  validate: (options) => Effect.tryPromise({ try: () => validateSources(options), catch: e => e }),
})

// In-process test layer
const SourceValidationInMemory = Layer.succeed(SourceValidation, {
  validate: () => Effect.succeed({ checkedAt: "2026-06-01T00:00:00.000Z", outcomes: [] }),
})
```

**Rename rule for Korri context:** All Bazzar service IDs `"bazzar/…"` become `"korri/acquisition/…"` to avoid collisions and conform to the project's domain language.

### Contract Command Envelope Pattern (Bazzar, preserve in Korri)

```ts
// source-contract-runner.ts pattern
export const runSourceContractCliCommand = (
  command: BazzarCliCommand,
  envelope: Effect.Effect<BazzarCliEnvelope, unknown, never>,
): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    const result = yield* envelope.pipe(
      Effect.catch(error => Effect.succeed(createSourceContractFailureEnvelope(command, error)))
    )
    yield* Console.log(serializeEnvelope(result))   // stdout only
    yield* Effect.sync(() => process.exit(result.exitCode))
  })
```

This pattern — catch-all → failure envelope → stdout → exit — must be preserved exactly in Korri. Logs go to the pino logger (stderr); the envelope goes to `Console.log` (stdout).

### Plugin Fixture Pattern (Bazzar → Korri)

Test plugins are `.mjs` files exporting a default `Plugin` object. They:
- Do not import from Bazzar/Korri source (hermetic)
- Log via `ctx.utils.log` (→ stderr through the plugin runtime)
- Return deterministic data (no network calls)

Co-located per plugin:
- `<name>.mjs` — plugin implementation
- `<name>.policy.ts` — `SourcePolicy` (download resolution host allowlist)
- `<name>.validation.ts` — `SourceValidationProbe` (test query and details URL)
- `<name>.mocks.ts` — mock HTTP responses used by unit tests
- `<name>.test.ts` — plugin unit test

### Logging Discipline

**Korri logger:** `@platform/logger` (`product/platform/logger/logger.ts`) — pino instance, browser-aware. In Node/Bun contexts it writes to stdout in production mode by default (uses default destination).

**Bazzar acquisition logger:** `shared/core/src/logger.ts` — pino with `pino.destination({ dest: 2 })` — **always stderr, sync: false**. This is critical: acquisition logs must never appear on stdout, which is reserved for machine-readable contract envelopes.

**Resolution:** The migrated acquisition code must keep its own logger that explicitly writes to stderr (fd 2), separate from `@platform/logger`. A thin `acquisitionLogger.ts` module (reusing the Bazzar logger initialization pattern) is the correct seam. Do not route acquisition logs through `@platform/logger` unless that module is confirmed to write to stderr in CLI mode.

### Nix Source Sets and Production Dependencies

Korri's `flake.nix` filters production deps via `tools/nix/bun-production-deps.ts` and the Nix `productionBunNix` overlay. After adding Bazzar core deps to `package.json`:

1. Run `just refresh-bun-deps` (re-runs `bun install --frozen-lockfile` + `bun x bun2nix`) to regenerate `tools/nix/generated/bun.nix` and `bun-production-package-names.nix`.
2. The `bun-production-deps.ts` production-allowlist already follows `dependencies` vs `devDependencies` from `bun.lock` — no manual edits to `bun-production-deps.ts` needed unless a dep is mis-classified.
3. `forbiddenProductionBunPackagePatterns` in `flake.nix` guards against dev tools creeping into the production closure — `ky`, `cheerio`, `@bufbuild/*`, `bs58` would not match any pattern, so no guard changes needed.

The install check in `package.nix` should gain `"$out/bin/korri" bazzar --help >/dev/null` alongside the existing `--version` check.

---

## Inventory Gate: Import / Adapt / Defer / Delete

### From Bazzar (`Bazzar:` prefix = paths relative to `/home/simonwjackson/code/sandbox/bazzar/`)

#### IMPORT — copy into Korri as-is or with minor namespace edits

| Bazzar source | Proposed Korri destination | Notes |
|---|---|---|
| `Bazzar:shared/core/src/plugin-runtime.ts` | `product/platform/acquisition/plugin-runtime.ts` | Keep; add `ky`, `cheerio` to Korri `package.json` |
| `Bazzar:shared/core/src/plugin-loader.ts` | `product/platform/acquisition/plugin-loader.ts` | Keep |
| `Bazzar:shared/core/src/plugin-operation-harness.ts` | `product/platform/acquisition/plugin-operation-harness.ts` | Keep |
| `Bazzar:shared/core/src/plugin-contract-codecs.ts` | `product/platform/acquisition/plugin-contract-codecs.ts` | Keep |
| `Bazzar:shared/core/src/plugin-cache.ts` | `product/platform/acquisition/plugin-cache.ts` | Keep; no TanStack Query dependency |
| `Bazzar:shared/core/src/plugin-execution-policy.ts` | `product/platform/acquisition/plugin-execution-policy.ts` | Keep |
| `Bazzar:shared/core/src/source-search.ts` | `product/platform/acquisition/source-search.ts` | Keep |
| `Bazzar:shared/core/src/source-details.ts` | `product/platform/acquisition/source-details.ts` | Keep |
| `Bazzar:shared/core/src/source-identity.ts` | `product/platform/acquisition/source-identity.ts` | Keep |
| `Bazzar:shared/core/src/source-aliases.ts` | `product/platform/acquisition/source-aliases.ts` | Keep |
| `Bazzar:shared/core/src/clock.ts` | `product/platform/acquisition/clock.ts` | Keep |
| `Bazzar:shared/core/src/errors.ts` | `product/platform/acquisition/errors.ts` | Keep |
| `Bazzar:shared/core/src/platform-catalog.ts` | `product/platform/acquisition/platform-catalog.ts` | Keep; separate from Korri's rocknix platform model |
| `Bazzar:shared/core/src/platform-mapping.ts` | `product/platform/acquisition/platform-mapping.ts` | Keep |
| `Bazzar:shared/core/src/security/credential-redaction.ts` | `product/platform/acquisition/security/credential-redaction.ts` | Keep |
| `Bazzar:shared/core/src/utils/filters.ts` | `product/platform/acquisition/utils/filters.ts` | Keep; add `@bufbuild/*` to Korri `package.json` |
| `Bazzar:shared/core/src/utils/cursor.ts` | `product/platform/acquisition/utils/cursor.ts` | Keep; add `bs58` to Korri `package.json` |
| `Bazzar:shared/core/src/utils/streaming.ts` | `product/platform/acquisition/utils/streaming.ts` | Keep |
| `Bazzar:shared/core/src/utils/game-grouping.ts` | `product/platform/acquisition/utils/game-grouping.ts` | Keep |
| `Bazzar:shared/core/src/cli/output-contract.ts` | `product/platform/acquisition/cli/output-contract.ts` | Keep including `BAZZAR_CLI_CONTRACT_VERSION = "bazzar.source-adapter.v1"` for initial migration; update to `korri.source-adapter.v1` only as a deliberate breaking-change step |
| `Bazzar:shared/core/src/types/plugin-types.d.ts` | `product/platform/acquisition/types/plugin-types.ts` | Rename `.d.ts` → `.ts`; keep types |
| `Bazzar:shared/core/src/types/source-health-types.ts` | `product/platform/acquisition/types/source-health-types.ts` | Keep |
| `Bazzar:shared/core/src/types/download-resolution-types.ts` | `product/platform/acquisition/types/download-resolution-types.ts` | Keep |
| `Bazzar:shared/core/src/types/source-outcome-codecs.ts` | `product/platform/acquisition/types/source-outcome-codecs.ts` | Keep |
| `Bazzar:shared/core/src/validation/source-validation.ts` | `product/platform/acquisition/validation/source-validation.ts` | Keep |
| `Bazzar:shared/core/src/download-resolution/download-resolution.ts` | `product/platform/acquisition/download-resolution/download-resolution.ts` | Keep |
| `Bazzar:shared/core/src/download-resolution/url-policy.ts` | `product/platform/acquisition/download-resolution/url-policy.ts` | Keep |
| `Bazzar:shared/core/src/plugins/<name>.mjs` (public-domain/open-source plugins) | `product/platform/acquisition/plugins/<name>.mjs` | Evaluate each plugin's legal status; include only permissible adapters |
| `Bazzar:shared/core/src/plugins/<name>.policy.ts` | `product/platform/acquisition/plugins/<name>.policy.ts` | Include alongside each imported plugin |
| `Bazzar:shared/core/src/plugins/<name>.validation.ts` | `product/platform/acquisition/plugins/<name>.validation.ts` | Include alongside each imported plugin |
| `Bazzar:apps/cli/src/__fixtures__/plugins/` | `product/apps/cli/bazzar/__fixtures__/plugins/` | Hermetic test fixtures; `fixture-final.mjs`, `coolrom.mjs`, `coolrom.validation.ts` |

#### ADAPT — import with Korri-specific changes required

| Bazzar source | Proposed Korri destination | Changes needed |
|---|---|---|
| `Bazzar:shared/core/src/runtime-config.ts` | `product/platform/acquisition/acquisition-config.ts` | Remove `api.*` section (port, host, corsOrigins, limits, defaultTimeoutMs). Rename type to `AcquisitionRuntimeConfig`. Keep `BAZZAR_PLUGINS_DIR` env var for initial migration. Keep `BAZZAR_*` env var names; document that renaming to `KORRI_ACQUISITION_*` is a future step. |
| `Bazzar:shared/core/src/logger.ts` | `product/apps/cli/bazzar/acquisition-logger.ts` | Keep pino → stderr pattern; do NOT reuse `@platform/logger` here (which may write to stdout in some modes). This is CLI-side only; the acquisition platform modules should accept an optional logger or use the same stderr-only logger. |
| `Bazzar:shared/core/src/source-policy.ts` | `product/platform/acquisition/source-policy.ts` | Replace `defaultBazzarPluginsDir()` calls with `defaultAcquisitionPluginsDir()` from adapted config. Update import paths. |
| `Bazzar:shared/core/src/source-validation-probes.ts` | `product/platform/acquisition/source-validation-probes.ts` | Same — replace `defaultBazzarPluginsDir()`. Update import paths. |
| `Bazzar:apps/cli/src/bazzar.ts` | `product/apps/cli/bazzar/bazzar-command.ts` | Rename root command from `"bazzar"` → `"bazzar"` (keep name); it becomes a subcommand of `korriCommand`, not a root `CliCommand.run` entry. Remove `BunRuntime.runMain`; export `bazzarCommand` instead. Import from `product/platform/acquisition/…` paths. Service IDs `"bazzar/…"` → `"korri/acquisition/…"`. |
| `Bazzar:apps/cli/src/cli-commands.ts` | `product/apps/cli/bazzar/bazzar-cli-commands.ts` | Update import paths. |
| `Bazzar:apps/cli/src/source-contract-commands.ts` | `product/apps/cli/bazzar/source-contract-commands.ts` | Update import paths. |
| `Bazzar:apps/cli/src/source-contract-runner.ts` | `product/apps/cli/bazzar/source-contract-runner.ts` | Update import paths. Change failure envelope source from `{ plugin: "bazzar", site: "Bazzar CLI" }` to `{ plugin: "korri-acquisition", site: "Korri Acquisition CLI" }`. |
| `Bazzar:apps/cli/src/source-contract-services.ts` | `product/apps/cli/bazzar/source-contract-services.ts` | Update import paths. Rename Effect service IDs. |
| `Bazzar:apps/cli/src/plugin-environment.ts` | `product/apps/cli/bazzar/plugin-environment.ts` | Update import paths. Rename service IDs. |
| `Bazzar:apps/cli/src/cli-runtime-services.ts` | `product/apps/cli/bazzar/acquisition-logging.ts` | Update import paths. Use `acquisition-logger.ts` instead of `@platform/logger`. |
| `Bazzar:shared/core/src/rpc/bazzar-rpc.ts` | `product/platform/acquisition/rpc/acquisition-rpc.ts` (ADAPT for CLI slice only) | This module is Lattice-aligned (Effect.gen, Context.Service, Schema). Adapt service class names / IDs. `BazzarRpcError` should become `AcquisitionRpcError` extending `Schema.TaggedErrorClass` (Korri convention). For the CLI-first slice, this module can be imported as-is with ID renames — full layer promotion deferred. |
| `Bazzar:tools/scripts/cli-contract-harness.ts` | `tools/testing/bazzar/acquisition-contract-harness.ts` | Rename config types; replace `cliPath` default to `apps/cli/src/bazzar.ts` → Korri's `korri-cli.ts` entry. Update Bun.spawnSync command from `["bun", cliPath, ...args]` to `["bun", "product/apps/cli/korri-cli.ts", "bazzar", ...args]`. |

#### DEFER — skip for the CLI-first slice; reserve for future UI/API work

| Bazzar area | Reason |
|---|---|
| `Bazzar:shared/core/src/rpc/bazzar-rpc.ts` (promotion to Korri RPC layer with full Effect Layer wiring) | The RPC surface is Lattice-aligned but fuller integration (e.g., wiring as a named `Layer` usable from the portal API) waits until the CLI slice is stable |
| Platform catalog reconciliation with Korri's rocknix platform model | Both have ~150+ platform definitions; merging without breaking the library model is a separate task |
| `BAZZAR_PLUGINS_DIR` → `KORRI_ACQUISITION_PLUGINS_DIR` rename | Preserve current env var name for initial migration; add alias in a later cleanup pass |
| Contract version `bazzar.source-adapter.v1` → `korri.source-adapter.v1` | Breaking change for any external consumers; document intent, execute separately |
| `BazzarRpcError` → `AcquisitionRpcError` as `Schema.TaggedErrorClass` | Fine for CLI slice as-is plain Error subclass; harden in the API layer pass |

#### DELETE — do not import

| Bazzar area | Reason |
|---|---|
| `Bazzar:apps/api/` (entire tRPC/Fastify surface) | Non-canonical dev/demo; excluded per R10 |
| `Bazzar:apps/ui/` (React + Tailwind demo UI) | Excluded per R9 |
| `Bazzar:package.json` `bin.bazzar` / `name: "bazzar"` | Standalone public binary identity eliminated per R3 |
| `Bazzar:nix/bazzar-cli.nix` | Replaced by Korri's `product/apps/cli/package.nix` (different build pattern) |
| `Bazzar:Justfile` | Replaced by additions to Korri's `justfile` |
| `Bazzar:biome.json` | Korri already has `biome.json` at root |
| `Bazzar:.envrc`, `Bazzar:flake.nix`, `Bazzar:flake.lock` | Korri has its own Nix environment |
| `Bazzar:tsconfig.json`, `Bazzar:tsconfig.test.json` | Korri's `tsconfig.json` governs |
| `Bazzar:tools/scripts/package-boundary.test.ts` | Bazzar-specific import boundary check; Korri uses fallow |
| `Bazzar:tools/scripts/smoke-cli.ts` | Replaced by Korri's install-check in `package.nix` |
| `Bazzar:shared/core/src/itchio/` (if separate from plugin) | Review: only needed if the itchio plugin imports from it; import only what the plugin needs |
| `Bazzar:shared/core/src/plugins/<commercial/grey-area>.mjs` | Policy decision per plugin; do not import without explicit legal review |

---

## Suggested Implementation Units

### Unit 1 — Acquisition platform library

**Location:** `product/platform/acquisition/`

**Contents:** All modules from the IMPORT and ADAPT (platform-side) rows above. No CLI-specific code, no API code, no standalone runtime entry.

**Key files:**
- `product/platform/acquisition/plugin-runtime.ts`
- `product/platform/acquisition/plugin-loader.ts`
- `product/platform/acquisition/plugin-operation-harness.ts`
- `product/platform/acquisition/plugin-contract-codecs.ts`
- `product/platform/acquisition/plugin-cache.ts`
- `product/platform/acquisition/plugin-execution-policy.ts`
- `product/platform/acquisition/source-search.ts`
- `product/platform/acquisition/source-details.ts`
- `product/platform/acquisition/source-identity.ts`
- `product/platform/acquisition/source-aliases.ts`
- `product/platform/acquisition/source-policy.ts` (adapted)
- `product/platform/acquisition/source-validation-probes.ts` (adapted)
- `product/platform/acquisition/clock.ts`
- `product/platform/acquisition/errors.ts`
- `product/platform/acquisition/acquisition-config.ts` (adapted runtime-config)
- `product/platform/acquisition/platform-catalog.ts`
- `product/platform/acquisition/platform-mapping.ts`
- `product/platform/acquisition/security/credential-redaction.ts`
- `product/platform/acquisition/utils/filters.ts`
- `product/platform/acquisition/utils/cursor.ts`
- `product/platform/acquisition/utils/streaming.ts`
- `product/platform/acquisition/utils/game-grouping.ts`
- `product/platform/acquisition/cli/output-contract.ts`
- `product/platform/acquisition/types/plugin-types.ts`
- `product/platform/acquisition/types/source-health-types.ts`
- `product/platform/acquisition/types/download-resolution-types.ts`
- `product/platform/acquisition/types/source-outcome-codecs.ts`
- `product/platform/acquisition/validation/source-validation.ts`
- `product/platform/acquisition/download-resolution/download-resolution.ts`
- `product/platform/acquisition/download-resolution/url-policy.ts`
- `product/platform/acquisition/rpc/acquisition-rpc.ts` (adapted bazzar-rpc, service IDs renamed)
- `product/platform/acquisition/plugins/` (selected legal plugins + policy/validation files)

**Invariants to preserve:**
- `@platform/*` must not import from `@product/*` — no CLI-layer imports allowed here
- All paths inside `product/platform/acquisition/` use relative imports; they do not use `@platform/acquisition/…` (no self-referencing alias)
- `SourceCandidate` and related types remain distinct from `ResolvedGameRecord` and `ContentItem`

### Unit 2 — CLI `bazzar` command group

**Location:** `product/apps/cli/bazzar/`

**Key files:**
- `product/apps/cli/bazzar/bazzar-command.ts` — `export const bazzarCommand = Command.make("bazzar").pipe(Command.withSubcommands([…]))`
- `product/apps/cli/bazzar/bazzar-cli-commands.ts` — `searchCommand`, `detailsCommand`, `pluginsCommand` (human-readable output)
- `product/apps/cli/bazzar/source-contract-commands.ts` — `validateSourcesCommand`, `resolveDownloadCommand`
- `product/apps/cli/bazzar/source-contract-runner.ts` — `runSourceContractCliCommand`
- `product/apps/cli/bazzar/source-contract-services.ts` — `SourceContractConfiguration`, `SourceValidation`, `DownloadResolution` Effect services (IDs: `"korri/acquisition/…"`)
- `product/apps/cli/bazzar/plugin-environment.ts` — `PluginEnvironment`, `PluginDirectory` Effect services
- `product/apps/cli/bazzar/acquisition-logger.ts` — pino → stderr logger (mirrored from Bazzar's `logger.ts`)
- `product/apps/cli/bazzar/acquisition-logging.ts` — `CliLogging` Effect service (mirrored from `cli-runtime-services.ts`)
- `product/apps/cli/bazzar/__fixtures__/plugins/fixture-final.mjs` — hermetic test plugin
- `product/apps/cli/bazzar/__fixtures__/plugins/coolrom.mjs` — re-exports fixture-final
- `product/apps/cli/bazzar/__fixtures__/plugins/coolrom.validation.ts` — fixture probe

### Unit 3 — Korri CLI integration

**File modified:** `product/apps/cli/korri-cli.ts`

Change:
```ts
// Before
export const korriCommand = Command.make("korri")
  .pipe(Command.withSubcommands([playCommand, streamCommand]))

// After
import { bazzarCommand } from "./bazzar/bazzar-command"

export const korriCommand = Command.make("korri")
  .pipe(Command.withSubcommands([playCommand, streamCommand, bazzarCommand]))
```

`runtimeLayer` does not change — the `bazzar` command group provides its own Effect services.

### Unit 4 — Dependency and Nix wiring

**File modified:** `package.json`

Add to `dependencies` (production):
```json
{
  "ky": "^1.7.2",
  "cheerio": "^1.0.0",
  "@bufbuild/cel": "^0.6.0",
  "@bufbuild/protobuf": "^2.12.0",
  "bs58": "^6.0.0"
}
```

Match the exact versions from `Bazzar:package.json` unless Korri's lockfile already has compatible versions.

**After editing `package.json`:**
1. `bun install` to update `bun.lock`
2. `just refresh-bun-deps` to regenerate `tools/nix/generated/bun.nix` and `tools/nix/generated/bun-production-package-names.nix`
3. Verify none of the new deps hit `forbiddenProductionBunPackagePatterns` in `flake.nix`

**File modified:** `product/apps/cli/package.nix`

Add install check:
```nix
"$out/bin/korri" bazzar --help >/dev/null
```

**File modified:** `flake.nix`

The existing `korriSources.cli` source set covers `product/apps/cli` and `product/platform` already. If acquisition code lands under `product/platform/acquisition/` and `product/apps/cli/bazzar/`, no source-set changes are needed. Verify after migration that the bundle does not include `node_modules` (existing check guards this).

### Unit 5 — Test harness helper

**Location:** `tools/testing/bazzar/acquisition-contract-harness.ts`

Adapted from `Bazzar:tools/scripts/cli-contract-harness.ts`. Changes:
- `cmd: ["bun", config.cliPath, ...config.args]` → `cmd: ["bun", config.cliPath, "bazzar", ...config.args]` (since `korri-cli.ts` is the entry, and `bazzar` is the subcommand)
- Or accept an `args` that already includes `"bazzar"` as the first element (simplest)
- Import `output-contract.ts` from the Korri-local path

---

## Suggested Tests

Following Korri's `bun:test` + in-process CLI test pattern (`korri-cli.test.ts`):

### `product/apps/cli/bazzar/bazzar-command.test.ts`

| Test | What it verifies |
|---|---|
| `runKorriCli(["bazzar", "--help"])` succeeds | Command group is registered and help renders |
| `runKorriCli(["bazzar", "search", "--help"])` succeeds | search subcommand registered |
| `runKorriCli(["bazzar", "details", "--help"])` succeeds | details subcommand registered |
| `runKorriCli(["bazzar", "plugins", "--help"])` succeeds | plugins subcommand registered |
| `runKorriCli(["bazzar", "validate-sources", "--help"])` succeeds | validate-sources subcommand registered |
| `runKorriCli(["bazzar", "resolve-download", "--help"])` succeeds | resolve-download subcommand registered |
| `runKorriCli(["bazzar", "does-not-exist"])` is failure | Unknown subcommand fails |

Pattern: same as `korri-cli.test.ts` — call `runKorriCli`, check `Exit.isSuccess` / `Exit.isFailure`.

### `product/apps/cli/bazzar/source-contract-commands.test.ts`

Mirror of `Bazzar:apps/cli/src/__tests__/source-contract-commands.test.ts`. Use `KORRI_ACQUISITION_PLUGINS_DIR` (or `BAZZAR_PLUGINS_DIR`) pointing to `product/apps/cli/bazzar/__fixtures__/plugins/`:

| Test | What it verifies |
|---|---|
| `createValidateSourcesEnvelope({ selectedSources: ["missing"] })` → `caller_error` envelope | Unknown sources produce typed caller_error |
| `createValidateSourcesEnvelope({ selectedSources: ["coolrom"] })` → healthy probe result | Fixture validation probe runs and passes |
| `createValidateSourcesEnvelope` with broken plugin dir → defective envelope | Load failure propagates as defective status |
| `createResolveDownloadEnvelope({ source: "fixture-final", … })` → `final_artifact` | Full resolution path returns correctly |
| `createResolveDownloadEnvelope({ source: "unknown-source", … })` → `caller_error` | Unknown source produces typed caller_error |

### `product/apps/cli/bazzar/source-contract-runner.test.ts`

Mirror of `Bazzar:apps/cli/src/__tests__/source-contract-runner.test.ts`:

| Test | What it verifies |
|---|---|
| `runSourceContractEnvelope("validate-sources", Effect.fail(…))` → validation caller_error envelope | Failed effect produces typed failure envelope, not an exception |
| `runSourceContractEnvelope("resolve-download", Effect.fail(…))` → resolution caller_error envelope | Same for resolution path |

### Subprocess contract test (new, mirrors `Bazzar:apps/cli/src/__tests__/cli-contract-subprocess.test.ts`)

**Location:** `product/apps/cli/bazzar/bazzar-contract-subprocess.test.ts`

Uses `tools/testing/bazzar/acquisition-contract-harness.ts`:

| Test | What it verifies |
|---|---|
| `korri bazzar resolve-download fixture-final <url> --title "…"` → stdout has valid envelope, stderr has logs, exit 0 | Stdout/stderr discipline for `resolve-download` |
| `korri bazzar validate-sources --sources coolrom` → valid validation envelope | End-to-end validate-sources subprocess path |
| `korri bazzar resolve-download unknown-src <url> --title "…"` → `caller_error` envelope, exit 21 | Typed failure for unknown source, correct exit code |
| `korri bazzar validate-sources --sources unknown-source` → `caller_error` envelope | Typed unknown source in validate path |

### Unit tests for acquisition platform modules

Mirror Bazzar's existing test suite at `Bazzar:shared/core/src/*.test.ts`. For each imported module, bring its companion test into `product/platform/acquisition/` and update import paths. Priority order for the CLI-first slice:

1. `product/platform/acquisition/cli/output-contract.test.ts` — envelope serialization, exit category mapping
2. `product/platform/acquisition/download-resolution/download-resolution.test.ts` — URL policy enforcement, outcome classification
3. `product/platform/acquisition/validation/source-validation.test.ts` — probe-based health outcomes
4. `product/platform/acquisition/plugin-contract-codecs.test.ts` — search/details/meta output validation
5. `product/platform/acquisition/plugin-loader.test.ts` — plugin discovery and load-failure classification
6. `product/platform/acquisition/utils/filters.test.ts` — CEL filter parse and execute
7. `product/platform/acquisition/utils/cursor.test.ts` — cursor encode/decode

Tests for `plugin-runtime.ts`, `source-search.ts`, `source-details.ts`, and individual plugin modules follow the same colocated pattern with `.mocks.ts` files providing deterministic HTTP responses.

---

## Key Alignment Checks Before Implementation

1. **`SourceCandidate` ≠ `ResolvedGameRecord`:** Confirm no code path in `product/platform/acquisition/` imports from `@platform/fixtures/games/game` or `@platform/library/…`. The two type families must remain distinct.

2. **Logger path:** Verify `acquisition-logger.ts` writes to `process.stderr` (fd 2) via `pino.destination({ dest: 2 })` before wiring the first end-to-end test. A misrouted log to stdout will break the contract envelope parse.

3. **Effect service ID uniqueness:** `"korri/acquisition/SourceValidation"` must not collide with any existing Korri service ID. Run `grep -r '"korri/acquisition/'` after migration to confirm no duplicates.

4. **`bun build` inclusion:** After adding files under `product/platform/acquisition/`, run `bun build product/apps/cli/korri-cli.ts --target=bun --outfile=/tmp/korri-cli-check.js` locally to confirm the bundle resolves without `--external` flags and without the `@proseql/core` codec issue (the existing sed loop in `package.nix` guards this, but the local smoke catches it early).

5. **`just typecheck` after every file move:** Path aliases require whole-repo typecheck; per-file `tsc` does not resolve `@platform/*`.

6. **Production closure guard:** The `package.nix` install check `[ -d "$out/share/korri-cli/node_modules" ]` ensures no `node_modules` ships. The new acquisition deps (`ky`, `cheerio`, etc.) must be bundled into the JS output by Bun — confirm they are not treated as externals.
