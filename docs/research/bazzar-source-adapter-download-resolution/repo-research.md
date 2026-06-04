# Repository Research: Bazzar Source Adapter and Download Resolution

Origin: `../../../work/01KT5CF934S7BZE95JHEHBSNBE-bazzar-monorepo-migration-korri-cli-acquisition/requirements.md`

---

## Technology & Infrastructure

**Korri (current cwd):**
- TypeScript + Bun + Effect + `effect/unstable/cli` + Nix flakes + bun2nix + direnv
- Biome for lint/format; `just` for task running
- CLI apps bundled with `bun build --target=bun`, wrapped with `makeWrapper` in Nix derivations
- Path aliases: `@app/*` → `korri/products/app/*`, `@shared/*` → `korri/shared/*`
- `nix/bun.nix` regenerated from `bun.lock` via `just refresh-bun-deps`; adding a new CLI binary follows the `nix/korri-cli.nix` pattern exactly

**Bazzar (fuji:~/code/scripts/bazzar):**
- TypeScript + Bun + Effect (v3.10, not v4) + Commander.js (not `effect/unstable/cli`) + Biome + `just`
- Own Nix devShell (minimal: bun, biome, just, curl, jq); no bun2nix, no packages/apps exposed
- No `package.json` scripts; all recipes in `Justfile`
- 58/281 tests failing; `just typecheck` broken (recipe calls bare `tsc`, not `bunx tsc`)
- No existing download-resolution seam; no source health type; `GameFile.url` is used for both direct archive URLs and HTML interstitial pages interchangeably

---

## Architecture & Structure

### Korri CLI — canonical pattern

**Entry:** `tools/cli/korri-cli.ts`
**Pattern:** `effect/unstable/cli` — `Command.make`, `Flag.string`, `Argument.string`, services via Effect layers (`LibrarySource`, `Launcher` from `@shared/library/library-services.ts`), `BunRuntime.runMain`.

```
korriCommand (root)
  ├── playCommand          — uses LibrarySource + Launcher + GamePicker
  └── streamCommand
        ├── streamLaunchCommand     — uses LibrarySource
        └── streamRemoteLaunchCommand
```

Tests at `tools/cli/korri-cli.test.ts`: help smoke test + typed exit code assertions (no mock layers needed because help/version don't require service context).

**Thin wrapper pattern (established):** Commands call into dedicated modules (`runSourceAwarePlayCommand`, `runStreamLaunchCommand`, `runRemoteStreamLaunchCommand`) that accept injected dependencies — `librarySource`, `gamePicker`, `intentStore`, etc. Commands stay small; all logic lives in the called module. Tests exercise the module directly without CLI parsing.

**Nix packaging for a CLI binary:** `nix/korri-cli.nix`:
1. `bun build <entrypoint> --target=bun --outfile=<name>.js` in `buildPhase`
2. `makeWrapper ${pkgs.bun}/bin/bun "$out/bin/<name>" --add-flags "$out/share/..."` in `installPhase`
3. Smoke test in `installCheckPhase`: `"$out/bin/korri" --version`
4. Guard against node_modules leaking into closure
5. Exposed in `flake.nix` under `apps.<system>.<name>`

Adding `korri-bazzar` later would follow this identical derivation shape with its own `nix/korri-bazzar.nix`.

### LibrarySource — the boundary to protect

`korri/shared/library/library-source.ts` and `korri/shared/library/library-services.ts`:
- `LibrarySource` = "known playable library content" — `list()`, `launchSpecFor()`, `resolveLaunchForGame()`
- Adapters: `LibrarySourceLayerLive` (proseql or rocknix mode via env), `makeInMemoryLibrarySourceLayer`, `makeFailingLibrarySourceLayer`
- This seam is explicitly designed to never bend for temporary adapters (see `../../../work/01KQJZR90GHVYQ169G3QWN3G5T-feat-personal-mvp-rocknix-launch/requirements.md` R9–R11)
- **Bazzar external results must never enter this seam.** External discovery is a pre-library lifecycle stage.

### SourceDiagnostic — closest existing health-state model

`tools/cli/source-aware-games.ts` already models partial-availability gracefully:
```ts
export interface SourceDiagnostic {
  readonly sourceKind: "local" | "remote"
  readonly sourceId: string
  readonly sourceName: string
  readonly category: "library-unavailable" | "host-unavailable" | "stream-unavailable" | "catalog-unavailable"
  readonly message: string
}
export interface SourceAwareGamesResult {
  readonly entries: readonly SourceAwareEntry[]
  readonly diagnostics: readonly SourceDiagnostic[]
}
```
This is the right idiom for Bazzar: a result carrying both values and typed diagnostics, where a failed source degrades gracefully without killing the whole result.

### RemoteSourceStatus — closest existing availability-state discriminated union

`korri/products/app/stream/remote-stream-client.ts`:
```ts
export type RemoteSourceStatus =
  | { status: "available"; streamControl: "enabled"; catalog: "available"; ... }
  | { status: "stream-unavailable"; streamControl: "disabled"; catalog: "unavailable"; ... }
  | { status: "unavailable"; message: string }
```
This three-state union (available, degraded/disabled, unavailable) is the right model for Bazzar source health.

### StreamLaunchFailureCategory — exit-code/category discipline

`tools/cli/stream-launch.ts` shows the established pattern for typed failure categories with deterministic exit codes:
```ts
type StreamLaunchFailureCategory = "usage" | "no-such-game" | "library-config" | "prepare-failed" | "cancelled"
// exit 2=usage, 3=no-such-game, 5=library-config, 6=prepare-failed, 130=cancelled
```
Bazzar's validation harness and CLI output should follow the same convention: a typed category string maps to a consistent exit code. Korri can key on exit code without parsing output.

### foreground-session-status.ts — standalone CLI tool template

`tools/cli/foreground-session-status.ts` is the clearest model for a standalone Bazzar-like CLI tool that emits JSON to stdout and uses typed exit codes without the full Effect CLI framework:
- Injected `io: { fetch?, write?, writeError? }` for testability without mocks
- Returns `Promise<number>` (exit code)
- Pure command parsing with `_tag` discriminated union

This is the exact shape a `bazzar source-check` or `bazzar resolve` command should take.

### Subprocess invocation precedent

`tools/device/flake-command.ts` shows how Korri calls an external binary (nix/ssh) with:
- `Bun.spawn` for async execution with stdio inheritance
- `spawnSync` for synchronous utility commands
- An injected `execute` dep for test isolation
- Structured result types, not string parsing

This is the right approach for a future thin Korri wrapper around a Bazzar binary.

---

## Bazzar Current State (relevant to planning)

### Plugin contract (no resolution seam today)

`shared/core/src/types/plugin-types.d.ts`:
- `Plugin.details(ctx, url): Promise<GameDetails>` — always returns `GameDetails`
- `GameDetails.files?: GameFile[]` — `GameFile.url` is a string with no resolution classification
- There is **no `ResolutionOutcome` type, no health state, no interstitial flag**
- `GameFile.format` carries `"html"` for WoWROMs interstitials — this is how the code currently signals that a URL isn't a real artifact

**Observed resolution gap:**
| Source | `details().files[0].url` | Actual type |
|---|---|---|
| coolrom | `https://dl.coolrom.com.au/dl/...` | Direct archive ✅ |
| retrostic | `https://downloads.retrostic.com/roms/...` | Direct archive ✅ |
| romhustler | `https://dl.romhustler.org/files/guest/...` | Direct archive (signed, time-limited) ✅ |
| wowroms | `https://wowroms.com/en/roms/.../download-.../84898.html` | HTML interstitial ❌ — format: "html" |
| steamgriddb | 401 API key failure, mock fallback returns synthetic data | Defective (silently fails) |

### Failing test root causes

1. **Cursor validation logic removed mid-development** — `cursor.ts` line 183: "Limit validation removed - cursors no longer track limits." Tests still expect limit checking, breaking 6+ cursor tests.
2. **CLI tests use wrong mock shape** — 16 Commander mock tests set up options via re-created program structure; tests don't call actual CLI. Incompatible with current command structure.
3. **Plugin metadata mismatch** — romhustler `meta()` now returns more platforms than tests expect.
4. **Game grouping ignores platform** — `generateGroupId` doesn't include platform in hash, so `generateGroupId("Super Mario Bros", "nes") === generateGroupId("Super Mario Bros", "gameboy")`.
5. **Plugin runtime timeout mocks wrong** — 5 tests.

### No validation harness exists

There is no `bazzar sources` / `bazzar health` / `bazzar check` command. The only way to check source behavior today is running `bun apps/cli/src/bazzar.ts search <query>` and manually inspecting output.

### Justfile `ci` recipe broken

`just ci` calls `just typecheck`, which calls `tsc --noEmit` — but `tsc` is not on the Nix shell PATH. Should be `bunx tsc --noEmit`.

### SteamGridDB key situation

- Hardcoded expired key in `shared/core/src/plugins/steamgriddb.mjs`
- `.env` has `BAZZAR_STEAMGRIDDB_API_KEY` but plugin ignores env
- On auth failure, plugin falls back to mock data and reports success — violates R13

---

## Implementation Patterns & Recommendations

### Plan structure suggestion

Work happens **entirely in Bazzar repo** during this slice. Korri work is limited to noting the future wrapper boundary; no Korri files change.

#### Bazzar Phase 1 — source adapter health contract

**New type: `SourceHealthReport`** (in `shared/core/src/types/health-types.d.ts` or inlined in a new `source-check` command):
```ts
type SourceHealth =
  | { readonly status: "healthy"; readonly sourceId: string }
  | { readonly status: "degraded"; readonly sourceId: string; readonly reason: string }
  | { readonly status: "unavailable"; readonly sourceId: string; readonly message: string }
  | { readonly status: "defective"; readonly sourceId: string; readonly reason: string }
  | { readonly status: "config-error"; readonly sourceId: string; readonly message: string }
```
Follow Korri's `RemoteSourceStatus` discriminated union shape.

**New command: `bazzar source-check [--sources <csv>] [--format json|text]`** (in `apps/cli/src/`)
- Runs each adapter's `search` and `details` on a known legal/safe probe candidate
- Never falls back to mock data; a source that rejects or 401s reports as `config-error` or `unavailable`
- Returns JSONL per source; overall exit 0 if all healthy, 1 if any degraded/defective, 2 if config error
- Probe registry: one entry per source with a known legal/free candidate URL or a `"no-safe-probe-available"` record

#### Bazzar Phase 2 — download resolution seam

**New type: `DownloadResolution`** (in `shared/core/src/types/plugin-types.d.ts` alongside `GameDetails`):
```ts
type DownloadResolutionStatus =
  | "final-artifact"       // URL is a direct downloadable archive
  | "interstitial"         // URL is an HTML handoff page requiring further JS/ajax handling
  | "blocked"              // Source returned a page but download is behind a wall
  | "unsupported"          // This adapter doesn't implement resolution for this source
  | "config-error"         // API key missing/rejected or env config issue
  | "source-defect"        // Adapter error or unexpected response shape

export interface DownloadResolution {
  readonly status: DownloadResolutionStatus
  readonly sourceId: string
  readonly candidateTitle?: string
  readonly artifactName?: string      // filename when known
  readonly artifactFormat?: string    // zip, rar, 7z, etc.
  readonly artifactSizeBytes?: number
  readonly url?: string               // present only when status === "final-artifact"
  readonly message?: string           // human-readable explanation for non-final states
}
```

**New `Plugin` method: `resolve?(ctx, url): Promise<DownloadResolution>`**
- Optional on the interface (not all plugins implement; return `{ status: "unsupported" }` default)
- Replaces the current implicit behavior of encoding interstitial state in `GameFile.format = "html"`

**Validation integration:** `bazzar source-check` calls `resolve()` when available and verifies the result is `"final-artifact"` for legal probe candidates where a download is expected.

#### Bazzar Phase 3 — test and tooling repair

Fix the broken test gaps identified above before Korri starts depending on any contract:
- Fix `cursor.ts` limit validation (re-add or remove the tests that expect it)
- Fix `just typecheck` to use `bunx tsc --noEmit`
- Fix SteamGridDB to read key from env and report `config-error` instead of mock fallback
- Fix `generateGroupId` to include platform
- Fix romhustler meta test expectation to match current actual

#### Korri future wrapper (not in this slice)

When Korri is ready for `korri bazzar`:
- New `nix/korri-bazzar.nix`: same shape as `nix/korri-cli.nix`, builds `apps/cli/src/bazzar.ts` into a pinned bundle
- New `tools/cli/bazzar-command.ts`: thin `Command.make("bazzar", ...)` that spawns the pinned Bazzar binary via `Bun.spawn`, passes typed args, captures JSON output
- Exit code contract is the primary interface; JSON output is secondary
- No Bazzar source code in `korri/`; no `LibrarySource` involvement

---

## Relevant Files

### Korri (reference)

| File | Relevance |
|---|---|
| `tools/cli/korri-cli.ts` | CLI entrypoint pattern to follow for `korri bazzar` wrapper |
| `tools/cli/korri-cli.test.ts` | Help/version smoke test pattern |
| `tools/cli/source-aware-games.ts` | `SourceDiagnostic` / partial-availability health model |
| `tools/cli/stream-launch.ts` | `StreamLaunchFailureCategory` exit-code discipline |
| `tools/cli/foreground-session-status.ts` | Standalone JSON-emitting CLI tool with injected IO |
| `tools/device/flake-command.ts` | Subprocess invocation via `Bun.spawn` with injected executor |
| `korri/shared/library/library-source.ts` | `LibrarySource` seam to stay out of |
| `korri/shared/library/library-services.ts` | `LibraryError` tagged error shape |
| `korri/products/app/stream/remote-stream-client.ts` | `RemoteSourceStatus` discriminated union idiom |
| `nix/korri-cli.nix` | Nix derivation template for a new Bun CLI binary |
| `flake.nix` (apps section, ~L972) | Where to expose a new `korri-bazzar` app |

### Bazzar (to change)

| File | What needs to change |
|---|---|
| `shared/core/src/types/plugin-types.d.ts` | Add `DownloadResolution` type; add optional `resolve?` to `Plugin` |
| `shared/core/src/plugins/wowroms.mjs` | Implement `resolve()` returning `interstitial`; fix JS-handoff extraction |
| `shared/core/src/plugins/coolrom.mjs` | Implement `resolve()` returning `final-artifact` |
| `shared/core/src/plugins/retrostic.mjs` | Implement `resolve()` returning `final-artifact` |
| `shared/core/src/plugins/romhustler.mjs` | Implement `resolve()` returning `final-artifact` (signed URL) |
| `shared/core/src/plugins/steamgriddb.mjs` | Read key from env; remove mock fallback; implement `resolve()` returning `config-error` when key absent |
| `shared/core/src/utils/cursor.ts` | Fix limit validation (align code and tests) |
| `shared/core/src/utils/game-grouping.ts` | Include platform in `generateGroupId` hash |
| `apps/cli/src/bazzar.ts` | Add `source-check` command |
| `Justfile` | Fix `typecheck` recipe to use `bunx tsc --noEmit` |

---

## Risks

1. **WoWROMs JS-handoff changes** — WoWROMs uses a timed countdown + AJAX token exchange to resolve the final download URL. The token TTL, endpoint path, and `getKey()`/`getToken()` signature can change server-side. Bazzar's `resolve()` for WoWROMs should be classified as best-effort with `interstitial` as fallback, not a guarantee.

2. **Romhustler signed URLs expire** — `dl.romhustler.org/files/guest/<jwt>` URLs are signed and time-limited. A `final-artifact` returned by `resolve()` is only valid for a few minutes. The `DownloadResolution` type should optionally carry an `expiresAt` timestamp.

3. **Bazzar test suite is not green** — Any plan that builds on Bazzar's current tests as acceptance criteria will be blocked. The repair work (Phase 3 above) should be sequenced before or alongside the new contract work, not after.

4. **Korri's `bun.lock` must not absorb Bazzar deps** — When Bazzar is eventually moved into Korri, its dependencies (ky, cheerio, filtrex, bs58, fastify, @trpc/server, etc.) will bloat Korri's dependency graph. Plan a dependency audit at migration time. Many Bazzar deps (`fastify`, `@trpc/server`, `@tanstack/query-core`) duplicate or conflict with Korri's existing stack.

5. **Bazzar uses Effect v3; Korri targets Effect v4** — Bazzar's `effect@^3.10.16` is behind Korri's direction. This is not a blocker for the hardening slice, but migration time will require attention if Bazzar is ever imported as a library.

6. **No package/app exposure in Bazzar's flake.nix** — Bazzar's flake exposes only a `devShells.default`. Adding a `packages.bazzar` or `apps.bazzar` output is required before Korri can pin and call it as a Nix app.

---

## Summary for Planning

**All work in this slice is Bazzar-side.** Korri changes are out of scope.

The Bazzar hardening slice has three sequential layers:
1. **Health contract** — new `SourceHealth` discriminated union + `bazzar source-check` command + legal probe registry
2. **Resolution seam** — new `DownloadResolution` type + optional `Plugin.resolve()` method + per-adapter implementations with correct classification (especially WoWROMs interstitial vs coolrom/retrostic/romhustler direct)
3. **Test and tooling repair** — fix cursor.ts, justfile, steamgriddb env key, game-grouping platform, romhustler meta

Future Korri wrapper depends only on the stable JSON output and exit codes of `bazzar source-check` and a future `bazzar resolve <url>`. No library import, no shared types crossing repo boundary.
