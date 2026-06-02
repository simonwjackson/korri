# Institutional Learnings for Bazzar Source Adapter and Download Resolution Plan

**Origin doc:** `docs/brainstorms/2026-06-01-001-bazzar-source-adapter-download-resolution-requirements.md`

---

## 1. LibrarySource boundary is strict — external discovery must not flow through it

**File:** `docs/solutions/best-practices/product-owned-composition-keeps-shared-layers-reusable-2026-05-03.md`  
**Type:** `best_practice`

Korri has a hard-learned rule: anything that *selects* a product's game catalog, handlers, or live adapters is **product-owned**, even when it looks like infrastructure. The `LibrarySource` seam means "known playable library content." Bazzar's external discovery results must not enter this seam merely because they were searched or resolved — only a later import/acquisition flow (which writes Korri-owned ProseQL YAML) may create a `LibrarySource`-visible entry.

**Constraint for planning:** The Bazzar source adapter contract and any future `korri bazzar` CLI surface live entirely outside the `LibrarySource`/`Launcher` seams. A Bazzar search result is not a `GameRecord`. Plan the adapter so deleting Bazzar changes nothing in the existing library, RPC, or launcher code paths.

---

## 2. External sources are snapshot importers, not live read paths

**File:** `docs/solutions/best-practices/proseql-canonical-library-with-derived-yaml-ids-2026-05-06.md`  
**Type:** `best_practice`

The established Korri pattern for external data sources (ROCKNIX, etc.) is:

```
external source → importer → ProseQL YAML → LibrarySource → RPC/UI/Launcher
```

The external source is parsed once and transformed into Korri-owned persistent records. It is never a selectable runtime database. Korri's runtime code reads ProseQL through existing seams; it does not reach back into the external source.

**Constraint for planning:** When a future Bazzar-to-Korri import flow eventually exists, the correct shape is: Bazzar resolves and downloads an artifact; an importer writes Korri-owned ProseQL YAML (following key-derived ID conventions); `LibrarySource` reads the result. Bazzar's plugin code does not persist anything to the Korri library directly.

---

## 3. Temporary/external adapters must be deletable — make the boundary explicit

**File:** `docs/solutions/best-practices/temporary-rocknix-sidecar-media-instead-of-es-gamelist-edits-2026-05-03.md`  
**Type:** `best_practice`

When a temporary external adapter is introduced (like the ROCKNIX sidecar), Korri convention is:
- Keep the adapter code confined to a single module
- Add a deletion-oriented comment near the seam
- Name env vars and config options to signal the temporary nature
- Do not let adjacent product code import the adapter's internals

**Constraint for planning:** Bazzar is a transitional dependency. The Korri CLI wrapper must call the stable Bazzar contract without importing plugin internals. Plan validation that the wrapper stays thin enough to delete when Bazzar is eventually co-located.

---

## 4. Real implementations over mocks — adapters need real HTTP and public-domain probes

**File:** `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`  
**Type:** `best_practice`

Korri's test posture: real implementations with configurable behavior, never `Stub*`/`Mock*`/`Fake*` doubles. Tests exercise real seams with controlled inputs. For adapters that hit external sources, the validated approach is:

- Real HTTP client with controllable target (use public-domain/freeware URLs)
- Configured-real doubles for anything injected (real plugin with fixture probe target, not mocked HTTP responses for the live health check)
- Test helpers live in `tools/testing/`, not in shared library code

**Constraint for planning:** Bazzar's validation harness must exercise actual HTTP calls against real sources using known-safe/legal probe candidates. The health-check path must not mock source responses or accept fallback data as valid. Bun's `bun test` is the test runner; `bun --config=bunfig.coverage.toml` enables coverage without slowing the dev loop.

---

## 5. Typed exit codes and discriminated result shapes are the CLI contract

**File:** `tools/cli/stream-launch.ts` (examined directly)  
**File:** `korri/shared/library/launcher.ts` (examined directly)  
**Type:** observed pattern

Korri CLI tools produce typed discriminated-union results internally (`StreamLaunchPrepareResult`, `LaunchResult`) and map them to specific numeric exit codes (`StreamLaunchFailureCategory → exitCode`). The caller (Korri CLI) never has to parse free-form error strings to know what failed.

```ts
// Established pattern: categories map to exit codes
function exitCodeForFailure(category: StreamLaunchFailureCategory): number {
  switch (category) {
    case "usage": return 2
    case "no-such-game": return 3
    case "library-config": return 5
    case "prepare-failed": return 6
    case "cancelled": return 130
  }
}
```

**Constraint for planning:** Bazzar's validation harness and download-resolution command output should follow this pattern: typed internal result union → explicit exit codes per category. The stable CLI contract Korri eventually wraps should be structured enough that a shell consumer can branch on exit code and parse JSON output, not grep stderr strings.

---

## 6. Korri CLI uses Effect `unstable/cli`, not Commander

**File:** `tools/cli/korri-cli.ts` (examined directly)  
**Type:** observed pattern

```ts
import { Argument, Command, Flag } from "effect/unstable/cli"

export const korriCommand = Command.make("korri").pipe(
  Command.withDescription("Korri command line interface."),
  Command.withSubcommands([playCommand, streamCommand]),
)
```

Subcommands are composed with `Command.withSubcommands`. The existing `korri play`, `korri stream launch`, and `korri stream remote-launch` surfaces all follow this pattern. Services are injected via `Layer.mergeAll` at `runKorriCli`.

**Constraint for planning:** A future `korri bazzar search`, `korri bazzar details`, `korri bazzar validate` surface will need to add a `bazzarCommand` composed with `Command.withSubcommands` and wired into the top-level `korriCommand`. Bazzar's Commander-based CLI is internal to Bazzar's repo — Korri does not expose it; it shells to it or imports only the stable contract.

---

## 7. Bun coverage needs a separate config file; `--coverage` CLI flag is silently ignored without `bunfig` opt-in

**File:** `docs/solutions/tooling-decisions/bun-coverage-via-separate-config-2026-05-29.md`  
**Type:** `tooling_decision`

In Bun 1.3.x, `bun test --coverage` is silently ignored when `bunfig.toml` contains `coverage = false`. Coverage only activates when `coverage = true` is set in the bunfig. The established pattern is a separate `bunfig.coverage.toml` with `coverage = true`, invoked via `bun --config=bunfig.coverage.toml test [paths...]`.

**Constraint for planning:** If Bazzar hardening adds coverage tooling, use a separate `bunfig.coverage.toml`. Do not set `coverage = true` in the main bunfig (it slows the dev loop for all `bun test` invocations). Wire it as `just test-coverage [paths...]` per Korri's established pattern.

---

## 8. Nix flake nixpkgs alignment prevents aarch64 cache splits when Bazzar is consumed downstream

**File:** `docs/solutions/tooling-decisions/align-flake-nixpkgs-to-downstream-pin-for-cache-coherence-2026-05-27.md`  
**Type:** `tooling_decision` (severity: high)

When Bazzar's Nix flake is eventually consumed by Korri's flake, a nixpkgs channel mismatch will cause source builds on aarch64 for packages like `nodejs`/`bun` that exist in cache only at the downstream consumer's pinned revision. The fix is aligning `inputs.nixpkgs.url` to match the downstream consumer (Korri's `nixos-25.11` pin).

**Constraint for planning:** Plan for an explicit nixpkgs alignment step when Bazzar's `flake.nix` is first consumed by Korri's flake. During the separate-repo phase, Korri can override Bazzar's input via `--override-input bazzar path:<local/bazzar>` for local development (per the pattern in `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`).

---

## 9. The Bazzar/Korri CLI handoff should use a stable pinned executable, not a live `npx`/`bun x` path

**File:** `docs/solutions/best-practices/korri-api-on-aarch64-handheld-via-bun-bundle-2026-05-27.md`  
**Type:** `best_practice`

Korri's pattern for deploying Bun-based tools to constrained devices is a single-file `bun build --target=bun` bundle. This avoids shipping `node_modules`, uses a deterministic artifact, and enables pinning via store path or release URL. Three `--external` flags handle library quirks (`jsonc-parser`, `pino-pretty`, `thread-stream`) and `--define process.env.NODE_ENV='"production"'` enables dead-code elimination.

**Constraint for planning:** When Korri eventually calls Bazzar as a subprocess, the subprocess should be a pinned Bun bundle or Nix-packaged executable, not an on-the-fly `bun run bazzar/apps/cli/src/bazzar.ts`. The bundle approach (per the Korri API pattern) also means Bazzar's `steamgriddb` fallback data issue and `thread-stream` absolute path issue must be fixed in Bazzar before bundling.

---

## 10. Constrain LLMs to classification, not database writes — applicable to game import pipeline

**File:** `docs/solutions/design-patterns/constrained-llm-entrypoint-classification-2026-05-24.md`  
**Type:** `design_pattern`

If Bazzar's download resolution eventually leads to a game archive import pipeline that uses LLM assistance (for archive layout classification), the established pattern is:

```
archive → deterministic scanner → minimal JSON classifier → validator → ProseQL writer
```

The model should rank candidates only. The deterministic writer owns YAML construction. The validator enforces the importer contract before anything is persisted.

**Constraint for planning:** Not immediately applicable for the Bazzar hardening slice, but relevant for any future import flow. The same deterministic-scan → constrained-model → deterministic-write split applies. Plan the download-resolution seam to be friendly to this shape: the resolver returns a typed artifact record (with `name`, `url`, `format`, `size`) that a downstream importer can validate without trusting the URL itself.

---

## 11. Validation harness for external contracts: the "stream runner validation contract" pattern

**File:** `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`  
**Type:** `workflow_issue`

Korri's existing external contract validation approach (for the Sunshine/Moonlight stream runner) involves:
- A bounded probe sequence with a generic safe target (public-domain/freeware game or known-stable command)
- Status files that persist the last known outcome for diagnostic reuse
- A clear distinction between "no intent queued" (healthy service, no probe yet) vs "source defect" (service responded with error)
- Explicit "enqueue first, launch second" discipline that mirrors R5 in the requirements: separate preparation from execution

**Constraint for planning:** Bazzar's validation harness should follow this pattern: pick one safe probe per source, record the health outcome in a persisted/queryable format, and distinguish "no probe run" from "probe failed" from "source defect." The harness should not require a Korri library or `LibrarySource` — it is a standalone diagnostic tool that runs in Bazzar's own environment.

---

## 12. WoWROMs download resolution requires a timed JS/ajax handoff — an interstitial, not a direct archive

**Source:** Live smoke test performed in this session (Fuji `~/code/scripts/bazzar`)  
**Type:** observed defect

During download validation, WoWROMs' plugin returned a `/download-<slug>/id.html` URL. The actual file download requires:
1. POST to `/en/emulators-roms/download/<id>/<title>?k=<timestamp>&t=<md5(timestamp)>` (the `getKey()`/`getToken()` JS functions)
2. Parse the JSON response `{"s":true,"link":"https://filesdw.wowroms.com/..."}` 
3. POST to the resolved link with the form body `emuid=<id>&id=<id>&file=<filename>`

The current Bazzar `wowroms.mjs` plugin does not fully implement this sequence. It falls through to a URL construction fallback that returns an HTML page, not an archive.

**Constraint for planning:** WoWROMs is a clear example of the download-resolution distinction in R5/R6. The plugin's `details()` returns a provisional/interstitial result. The resolution seam must classify this as `interstitial-requires-further-handling`, not `final-artifact-resolved`. The validation harness must test this classification, not assume the URL in `GameFile.url` is directly downloadable.

---

## 13. SteamGridDB hardcoded API key is in-source, fallback mock masks failures

**Source:** Live inspection of `fuji:~/code/scripts/bazzar/shared/core/src/plugins/steamgriddb.mjs`  
**Type:** observed defect (severity: medium for Korri trust posture)

The `steamgriddb.mjs` plugin hardcodes an API key in source (`Bearer 5e2b3e6fd79e9a7183cbd5e96745ba80`) which is currently rejected with `401 Invalid API key`. On auth failure, the plugin falls into a mock-data fallback that returns a synthesized game record, making the source appear healthy when it is not.

This violates R13 (no silent fallback success) and R14 (auth failure must be explicit).

**Constraint for planning:** The SteamGridDB plugin must be excluded from validation harness runs until:
1. API key is moved out of source to `.env` / `BAZZAR_STEAMGRIDDB_API_KEY`
2. The mock/fallback path on auth failure is removed from live execution paths

The `.env` file already has `BAZZAR_STEAMGRIDDB_API_KEY` but the plugin code does not read it — it reads the hardcoded constant instead. This is a bug to fix in Bazzar before SteamGridDB is re-included in the harness.

---

## 14. Bazzar test suite: 58 failures and missing typecheck — fix before declaring the contract stable

**Source:** Live `bun test` run in this session (Fuji `~/code/scripts/bazzar`)

Current Bazzar test results: **223 pass, 58 fail, 1 error**.

Notable failure categories:
- Cursor validation: strict mode not enforced (filters/limit mismatch, expiry)
- Plugin pagination: `limit` option not honored by `coolrom`, `romhustler`, `wowroms`, `retrostic`
- `game-grouping.ts`: `generateGroupId` does not include platform in grouping — same-title games on different platforms get the same ID
- Streaming: global limit not respected in `streamSearchResults`
- CLI integration tests: all failing (mock seam vs real interface drift)
- Plugin runtime tests: timeout behavior and HTTP error propagation failing

`just typecheck` fails because the `tsc` binary is not on PATH in the Nix dev shell (recipe calls bare `tsc`, but TypeScript is only available via `bunx tsc`).

**Constraint for planning:** The plan must sequence fixing these failures *before* declaring the source adapter contract stable. The 58 failures are not cosmetic — they point to real contract drift in pagination, download-resolution shape, grouping logic, and cursor validation. Until these are green, Korri cannot safely rely on the advertised behavior.

---

## 15. Bazzar's Justfile recipe `typecheck` uses bare `tsc` — fix for Nix dev shell

**Source:** Live validation in this session

`just typecheck` fails with `tsc: command not found` because `tsc` is not on PATH in the Nix dev shell. TypeScript is only available as a dev dependency via `bunx tsc`. This is a one-line fix in the `Justfile`:

```makefile
# Before
typecheck:
    tsc --noEmit

# After
typecheck:
    bunx tsc --noEmit
```

**Constraint for planning:** Fix this in the Bazzar Justfile as part of the hardening slice. All Nix/direnv-based CI and dev tooling expects `just typecheck` to work without additional ambient tooling.

---

## 16. Plugin tests use global `fetch` mocking against real module imports — risky

**Source:** Inspection of `shared/core/src/plugin-runtime.test.ts`, `apps/cli/src/__tests__/integration.test.ts`

The Bazzar test suite mocks `global.fetch` to test plugin runtime and integration behavior. Korri's convention (`prefer-real-implementations-over-mocks`) would push toward real HTTP against fixture URLs or a lightweight test server, with the mock only at the "external target" level (not at `fetch` itself). Mocking `global.fetch` at this level means test failures are as likely to reflect the mock's behavior as the real plugin's.

**Constraint for planning:** The plan should note that Bazzar's test approach diverges from Korri's configured-real posture. The harness for adapter health (R1-R3) should use real HTTP probes against real sources with legal fixture targets, not mocked responses. Unit tests for pagination and cursor logic (where real HTTP is not needed) may keep the current approach.

---

## Summary of Planning Constraints

| Constraint | Affects | Source |
|---|---|---|
| External results must not enter `LibrarySource` | R11 | Learning 1, 2 |
| Bazzar import → ProseQL YAML → LibrarySource is the correct import shape | R11 | Learning 2 |
| Adapter boundary must be deletable | R9, R10 | Learning 3 |
| Validation harness must use real HTTP with legal probe targets | R1-R3, R8 | Learning 4, 11 |
| CLI result types should be discriminated unions → typed exit codes | R2, R6 | Learning 5 |
| Future `korri bazzar` surface uses `effect/unstable/cli` pattern | R10, R12 | Learning 6 |
| Bun coverage requires separate `bunfig.coverage.toml` | tooling | Learning 7 |
| Nix nixpkgs alignment needed before Korri consumes Bazzar flake | R9, dependency | Learning 8 |
| Korri wrapper should shell to pinned Bun bundle, not live source | R10, R12 | Learning 9 |
| WoWROMs plugin returns interstitial, not final artifact | R5, R6, AE2 | Learning 12 |
| SteamGridDB must be excluded until auth and fallback are fixed | R13, R14 | Learning 13 |
| 58 Bazzar test failures must be fixed before contract is stable | R1-R3, R5 | Learning 14 |
| `just typecheck` fails due to bare `tsc` — fix in Justfile | tooling | Learning 15 |
| Global `fetch` mocking should be replaced with real HTTP probes for harness | R1-R3 | Learning 16 |
