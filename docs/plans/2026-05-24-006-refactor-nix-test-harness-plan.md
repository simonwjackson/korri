---
title: "refactor: Split nix-eval tests out of `bun test` and batch their evaluations"
type: refactor
status: completed
date: 2026-05-24
verify_command: "just typecheck && just test-unit && just test-nix && just lint"
---

## Summary

`bun test` takes 11m25s today because 7 files under `tools/testing/nix/` each spawn `nix eval` per `it()` block (~12s per eval). One file (`korri-desktop-build-graph.test.ts`) already proves the fix: one `nix eval` at module-load, all `it()` blocks consume the cached attrset, 0ms per test. This plan applies that pattern to the other 6 files, gates `bun test` so the nix files are excluded from the default fast loop, and adds a structural guard so they cannot drift back in.

---

## Problem Frame

`bun test` is the day-to-day TDD loop. At 11+ minutes per run, devs avoid it; behaviorial regressions get caught only at `just check` or CI time. The cost is concentrated: 94% of wall time (646s of 685s) is in 7 files, all of which do the same shape of work — evaluate a NixOS module under different configurations, assert structural properties of the result. None of them tests JavaScript behavior; they're written as `bun test` purely for `expect()` ergonomics and TS infra co-location.

The fix is structural, not architectural. Replace per-test `spawnSync("nix", ["eval", "--apply", differentOverrides])` with one fixture call returning `{ scenarioName = result; ... }` for every scenario in the file. Tests then read from the cached attrset by key. Time drops from `N × ~12s` to `~1 × ~20s` per file.

---

## Requirements

- R1. `just test-unit` (i.e., `bun test` with the default exclusion) must complete in ≤ 30s on dev hardware.
- R2. Every assertion currently in `tools/testing/nix/*.test.ts` must continue to pass with the same semantic meaning and produce comparable failure messages.
- R3. `just check` must continue to run both the fast unit suite and the full nix-evaluation suite.
- R4. Nix tests must remain invokable on demand without env-var dances: `just test-nix` runs the whole nix suite; `bun test tools/testing/nix/<file>.test.ts` runs one file.
- R5. The exclusion of `tools/testing/nix/**` from the default `bun test` must be structurally guarded so a future contributor cannot reintroduce nix files into the fast loop accidentally.
- R6. The nix-eval suite (`just test-nix`) wall time must drop materially — target ≤ 3 minutes from today's ~11 minutes. (Single-file evals are bound by nixpkgs/flake load cost; getting below ~30s/file is unrealistic.)

---

## Scope Boundaries

- Out: migrating any test to native `flake.checks` (loses `expect()` ergonomics; not justified by the gain over batching).
- Out: CI workflow restructuring or path-based job filtering.
- Out: changing test coverage — no new scenarios, no removed scenarios, no behavioral edits to NixOS modules.
- Out: touching `bunfig.toml` `pattern` shape (cleaner to keep the include pattern canonical and exclude via flag at recipe invocation).
- Out: re-batching `korri-desktop-build-graph.test.ts` (already done correctly) and `korri-live-usb-smoke.test.ts` (only 2 tests doing fundamentally different work — ISO dry-build + doc smoke; not usefully batchable).

### Deferred to Follow-Up Work

- Migrating an exemplar nix test to `flake.checks` as a long-term direction: separate evaluation after this lands.
- CI path-filtering so the nix-test job only runs when nix paths change: orthogonal optimization on the gated suite, not the harness.

---

## Context & Research

### Relevant Code and Patterns

- `tools/testing/nix/korri-desktop-build-graph.test.ts` and its `tools/testing/nix/korri-desktop-build-graph.fixture.nix` — the working precedent. The fixture returns one attrset of values (drvPath strings, booleans, package lists); the test file calls `evalBuildGraph()` once at `describe()` body-load and all `it()` blocks index into the shared `result`. Per-test wall time: 0ms.
- `tools/testing/nix/korri-kiosk-module-eval.test.ts` and `.fixture.nix` — the dominant cost (228s / 17 evals). Fixture currently takes `overrides` as a Nix expression string, plumbed through `--apply f: f { … overrides = ${overridesNix}; }`. Each test passes a different inline NixOS module fragment as the overrides string.
- `tools/testing/nix/korri-server-module-eval.test.ts` and `.fixture.nix` — 24 evals, partially batched per `describe()` block (`const result = expectOk(evalFixture(...))` once per describe scope). The refactor here is to lift that one level: one eval per file, indexed by scenario key.
- `bunfig.toml` lines 6–7: `pattern = ["**/*.test.ts", "**/*.test.tsx"]` — the include glob. No exclude key in Bun's TOML config.
- `bun test --path-ignore-patterns "<glob>"` — Bun's CLI flag for exclusion at invocation time (`bun test --help` confirms). The fast suite uses this; the slow suite doesn't pass it.
- `justfile` `test-unit`, `test`, and `check` recipes — single-line recipes; trivial to extend with a new `test-nix` sibling.
- `flake.nix` lines 458–469 — existing `checks.${system}.korri-live-usb-config` and `korri-live-usb-vm-smoke`. Establishes the project's pattern for "tests as nix derivations" but is not what this plan migrates to.
- `tools/testing/standards/naming-conventions.test.ts` — the existing structural-guard pattern. Reads source, asserts invariants. The new exclusion guard mirrors this shape.

### Institutional Learnings

- None directly applicable in `docs/solutions/`. This refactor is novel enough to warrant a `/se-compound` capture after it lands.

### External References

- None needed. Bun's `--path-ignore-patterns` is in `bun test --help`. Nix's `--apply` and `--json` are stable.

---

## Key Technical Decisions

- **Exclusion via recipe flag, not bunfig pattern surgery.** Bun's `pattern` is include-only; carving it up to omit `tools/testing/nix/**` would require either listing every other top-level directory or doubling the maintenance burden when test paths change. Passing `--path-ignore-patterns "**/tools/testing/nix/**"` to `bun test` in the `test-unit` recipe keeps the include pattern canonical and lets `bun test tools/testing/nix/<file>.test.ts` still work on demand.
- **Scenarios defined inline in each fixture as a named attrset.** The TS side calls `evalFixture()` with no per-scenario arguments and reads from `result.scenarios.<key>`. This narrows the JS↔Nix boundary, makes each fixture self-describing, and matches `desktop-build-graph.fixture.nix`'s working shape. The alternative — passing a list of scenario descriptors from TS into `--apply` — keeps the cross-boundary string-building cost we're trying to eliminate.
- **One commit per file refactor.** Each fixture-and-test pair is independently verifiable: same test names, same pass count, dramatically lower wall time. Failures isolate to one file. Mirrors the commit cadence used for the previous renderer/bun refactor.
- **Structural guard via standards test, not wall-time assertion.** A wall-time assertion is environment-dependent (CI hardware, nix store warm/cold, parallel load). A test that reads `justfile` and asserts `test-unit`'s line contains `--path-ignore-patterns` with the nix glob is deterministic and catches the actual regression mode: someone removing the flag.
- **`korri-live-usb-smoke.test.ts` stays as-is.** Its two tests do fundamentally different work (ISO dry-build, doc smoke). Batching them into one fixture would conflate unrelated work for marginal time savings. Document the decision in U7 and move on.

---

## Open Questions

### Resolved During Planning

- *How to exclude nix files from the default suite?* `--path-ignore-patterns` flag on the `test-unit` recipe. See Key Decisions.
- *Where do scenario definitions live?* Inline in each fixture. See Key Decisions.
- *How is the exclusion guarded?* Standards test reading `justfile`. See Key Decisions.
- *Does `korri-desktop-build-graph` need touching?* No — already correctly batched (0ms per test).
- *Does `korri-live-usb-smoke` need batching?* No — 2 tests doing different work; not usefully batchable.

### Deferred to Implementation

- Exact key naming convention for scenario attrsets in each fixture (`baseline`, `with-kiosk-input`, etc.). Will become clear when each fixture is rewritten — should read naturally from the corresponding `it()` block's intent string.
- Per-file final wall-time achieved. Single-file evals are bound by nixpkgs/flake load cost (~10–20s); how much overhead the batched scenario evaluation adds will only be measurable after refactor.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

**Before (current shape, e.g. `korri-kiosk-module-eval.test.ts`):**

```text
TS:    it("scenario A") -> evalFixture(overridesA) -> spawnSync nix -> 12s
       it("scenario B") -> evalFixture(overridesB) -> spawnSync nix -> 12s
       it("scenario C") -> evalFixture(overridesC) -> spawnSync nix -> 12s
       (17 tests × 12s = 204s per file)

Nix:   fixture takes `overrides` arg, evaluates module with overrides applied
```

**After (target shape, mirroring `korri-desktop-build-graph.fixture.nix`):**

```text
TS:    const result = evalFixture()                   -> spawnSync nix -> ~20s
       it("scenario A") -> read result.scenarios.A    -> 0ms
       it("scenario B") -> read result.scenarios.B    -> 0ms
       it("scenario C") -> read result.scenarios.C    -> 0ms
       (17 tests × 0ms + 1 × ~20s = ~20s per file)

Nix:   fixture defines `scenarios = { a = evalWith {...}; b = evalWith {...}; }`
       returns one big attrset containing all scenario results
```

The fixture's existing `overrides` parameter goes away — scenarios are pre-enumerated inside the fixture, not parameterized from TS. The TS `evalFixture()` helper takes no scenario argument and returns the full attrset; per-test access is `result.scenarios.<key>`.

---

## Implementation Units

### U1. Split the recipe and exclude nix tests from the default fast loop

**Goal:** `just test-unit` returns to ~13s by excluding `tools/testing/nix/**`. A new `just test-nix` recipe runs the slow suite. `just check` runs both.

**Requirements:** R1, R3, R4

**Dependencies:** None

**Files:**
- Modify: `justfile` (`test-unit`, `check` recipes; add `test-nix` recipe)
- Test: `tools/testing/standards/test-suite-partitioning.test.ts` (new — see U8 for the full guard; this unit lands the recipe shape only)

**Approach:**
- `test-unit` becomes: `bun test --path-ignore-patterns "**/tools/testing/nix/**"`
- New `test-nix` recipe: `bun test tools/testing/nix/`
- `check` recipe order: `validate-router lint typecheck test-unit test-nix check-bdd check-bun-deps`
- `test` alias keeps pointing at `test-unit` (the fast loop).

**Execution note:** TDD. Write the structural guard first (see U8), watch it fail, then edit the justfile to make it pass. The guard is small enough to land alongside U1 if preferred; keeping it as U8 lets U1 ship the user-visible win quickly.

**Patterns to follow:**
- Existing `justfile` recipe style (single-line, no chained `&&` inside a single recipe body for separable concerns).
- `bun test --path-ignore-patterns` (confirmed via `bun test --help` and the debug-session reproduction).

**Test scenarios:**
- Happy path: `just test-unit` exits 0 in ≤ 30s after this change (verify locally).
- Happy path: `just test-nix` runs all 7 nix test files and exits 0.
- Happy path: `just check` runs both suites in order and exits 0.
- Edge case: `bun test tools/testing/nix/korri-kiosk-module-eval.test.ts` still works (the exclusion is recipe-level, not bunfig-level).

**Verification:**
- `just test-unit` wall time drops to ~13s.
- `just test-nix` exists and runs the nix suite (still slow until U2-U6).
- `just check` succeeds and includes both.

---

### U2. Batch `korri-kiosk-module-eval` evaluations

**Goal:** Collapse 17 per-test `nix eval` calls into one fixture-level eval that returns all scenarios as a keyed attrset. Highest single-file impact (228s → ~20s).

**Requirements:** R2, R6

**Dependencies:** U1 (so the speedup is observable via `just test-nix`)

**Files:**
- Modify: `tools/testing/nix/korri-kiosk-module-eval.fixture.nix`
- Modify: `tools/testing/nix/korri-kiosk-module-eval.test.ts`

**Approach:**
- In the fixture: drop the `overrides ? { }` argument. Define `scenarios = { baseline = evalWith { }; clientWithLauncher = evalWith ({ pkgs, ... }: { ... }); ... }` for all 17 current scenarios. Return `{ scenarios = { … }; }` (or merge other top-level fields the test reads today).
- In the test: rename `evalFixture(overridesNix)` → `evalAllScenarios()`, called once at module top. Each `it()` reads `result.scenarios.<key>` instead of calling `evalFixture(...)`.
- Scenario keys read from the current `it()` description text — e.g., "aggregate korri module exposes server, client, …" → `aggregateRoles`; "enabling kiosk mkDefault-enables client …" → `kioskEnablesClient`. Naming is local to the file.

**Execution note:** TDD by mirror. Don't write new assertion code — every existing `expect()` line stays exactly as-is. The only edit on the TS side is replacing the `evalFixture(…)` call with `result.scenarios.<key>` access.

**Patterns to follow:**
- `tools/testing/nix/korri-desktop-build-graph.test.ts` body shape: single `evalBuildGraph()` at the top of the outer `describe()`, nested `describe()`s and `it()`s consume the shared `result` by field access.
- `tools/testing/nix/korri-desktop-build-graph.fixture.nix` for the attrset-returning fixture shape.

**Test scenarios:**
- Behavior preservation: every existing `it()` in `korri-kiosk-module-eval.test.ts` continues to pass with the same assertion text.
- Happy path: `bun test tools/testing/nix/korri-kiosk-module-eval.test.ts` reports the same `N pass` count as before the refactor.
- Performance: wall time for this file drops from ~228s to ≤ 30s.

**Verification:**
- `bun test tools/testing/nix/korri-kiosk-module-eval.test.ts` → 17/17 pass, wall ≤ 30s.
- Diff of test output before/after shows no removed or renamed test cases.

---

### U3. Batch `korri-server-module-eval` evaluations

**Goal:** Same pattern as U2 applied to `korri-server-module-eval`. Has 24 `evalFixture()` calls (partially batched per describe today) — fully batch to one eval per file.

**Requirements:** R2, R6

**Dependencies:** U1, U2 (U2 establishes the batched-fixture pattern; U3 follows it)

**Files:**
- Modify: `tools/testing/nix/korri-server-module-eval.fixture.nix`
- Modify: `tools/testing/nix/korri-server-module-eval.test.ts`

**Approach:**
- Same shape as U2: fixture pre-defines all scenario inputs, returns `{ scenarios = { … }; }`.
- Many scenarios in this file are scoped inside nested `describe("default user mode", () => { const result = expectOk(evalFixture(...)); … })`. Lift the per-describe results into named keys on the shared attrset; the nested `describe()` blocks survive but now consume `sharedResult.scenarios.<key>` instead of calling `evalFixture(...)` themselves.

**Patterns to follow:** U2.

**Test scenarios:**
- Behavior preservation: every existing test in this file continues to pass.
- Performance: wall time for this file drops materially (target ≤ 30s).

**Verification:**
- `bun test tools/testing/nix/korri-server-module-eval.test.ts` → same pass count, wall ≤ 30s.

---

### U4. Batch `korri-live-usb-safety-eval` evaluations

**Goal:** Same pattern, 8 tests / 8 evals → 1 eval.

**Requirements:** R2, R6

**Dependencies:** U1, U2

**Files:**
- Modify: `tools/testing/nix/korri-live-usb-safety-eval.fixture.nix`
- Modify: `tools/testing/nix/korri-live-usb-safety-eval.test.ts`

**Approach:** Same as U2. Each scenario maps to one persistence-resolver input combination (sibling USB, tmpfs fallback variants). Pre-define each as a named scenario in the fixture.

**Patterns to follow:** U2.

**Test scenarios:**
- Behavior preservation: 8/8 still pass with same assertions.
- Performance: wall time drops materially.

**Verification:**
- `bun test tools/testing/nix/korri-live-usb-safety-eval.test.ts` → 8/8 pass.

---

### U5. Batch `korri-image-outputs-eval` evaluations

**Goal:** Same pattern, 9 tests → 1 eval.

**Requirements:** R2, R6

**Dependencies:** U1, U2

**Files:**
- Modify: `tools/testing/nix/korri-image-outputs-eval.fixture.nix`
- Modify: `tools/testing/nix/korri-image-outputs-eval.test.ts`

**Approach:** Same as U2. Scenarios correspond to "does flake output X exist with expected shape" — each can be one named attrset entry.

**Patterns to follow:** U2.

**Test scenarios:**
- Behavior preservation: 9/9 still pass.
- Performance: wall time drops materially.

**Verification:**
- `bun test tools/testing/nix/korri-image-outputs-eval.test.ts` → 9/9 pass.

---

### U6. Batch `korri-rocknix-image-eval` evaluations

**Goal:** Same pattern, 7 tests → 1 eval.

**Requirements:** R2, R6

**Dependencies:** U1, U2

**Files:**
- Modify: `tools/testing/nix/korri-rocknix-image-eval.fixture.nix`
- Modify: `tools/testing/nix/korri-rocknix-image-eval.test.ts`

**Approach:** Same as U2. Thor / Sobo rocknix appliance scenarios become named attrset entries.

**Patterns to follow:** U2.

**Test scenarios:**
- Behavior preservation: 7/7 still pass.
- Performance: wall time drops materially.

**Verification:**
- `bun test tools/testing/nix/korri-rocknix-image-eval.test.ts` → 7/7 pass.

---

### U7. Document the no-batch decision for `korri-live-usb-smoke`

**Goal:** Add a top-of-file comment in `korri-live-usb-smoke.test.ts` explaining why this file stays as-is (2 tests doing fundamentally different work; ISO dry-build + doc smoke; batching offers no useful win). Prevents a future refactor pass from treating it as inconsistent and "fixing" it.

**Requirements:** R2 (preservation), R6 (suite-level budget — this file's cost is fixed by `nix build --dry-run`, not addressable here)

**Dependencies:** U2 (establishes the pattern this file is opting out of)

**Files:**
- Modify: `tools/testing/nix/korri-live-usb-smoke.test.ts`

**Approach:**
- Add a leading comment block: "This file is intentionally not batched. Both tests do fundamentally different work (one dry-builds the ISO derivation, one is a documentation smoke). Batching would conflate them for no time savings. See docs/plans/2026-05-24-006-refactor-nix-test-harness-plan.md U7."

**Test scenarios:**
- Test expectation: none — comment-only change, no behavior touched.

**Verification:**
- Comment present; file otherwise unchanged; `bun test tools/testing/nix/korri-live-usb-smoke.test.ts` exits 0 with same 2/2 pass.

---

### U8. Structural guard against nix tests sneaking back into the fast loop

**Goal:** A standards test that fails CI if someone removes `--path-ignore-patterns "**/tools/testing/nix/**"` from `just test-unit`, or if a new test file lands outside the recognized fast directories.

**Requirements:** R5

**Dependencies:** U1 (the recipe shape this test asserts against)

**Files:**
- Create: `tools/testing/standards/test-suite-partitioning.test.ts`

**Approach:**
- Test reads `justfile` as a string.
- Asserts the `test-unit` recipe body contains both substrings `--path-ignore-patterns` and `tools/testing/nix/`.
- Asserts `check` recipe includes both `test-unit` and `test-nix`.
- Asserts `test-nix` recipe exists and references `tools/testing/nix/`.

**Execution note:** TDD. This test should be the first thing written for U1 (RED), then U1's justfile edits turn it GREEN. Committed in U8 to keep U1's diff focused on user-visible recipe changes; logically inseparable but commit-separable.

**Patterns to follow:**
- `tools/testing/standards/naming-conventions.test.ts` for the "read source, assert invariants" shape.

**Test scenarios:**
- Happy path: `test-unit` recipe contains the exclusion flag and glob → pass.
- Failure path: simulate by reading a fixture string instead of `justfile` content where the flag is missing → would fail (write the assertion such that failure cleanly identifies which substring is absent).
- Happy path: `check` recipe lists both `test-unit` and `test-nix`.
- Happy path: `test-nix` recipe exists.

**Verification:**
- The test passes against the post-U1 `justfile`.
- Manually removing the `--path-ignore-patterns` flag from `test-unit` causes this test to fail with a clear message.

---

## System-Wide Impact

- **Interaction graph:** None within app code. The change is to test invocation only.
- **Error propagation:** Same as today — each test file's failures bubble through Bun's runner unchanged. A batched fixture that fails at eval time fails *every* `it()` in that file (vs. one previously); failure messages get the full nix stderr.
- **State lifecycle risks:** None.
- **API surface parity:** `just test-unit` semantics change — it no longer runs nix tests. Anywhere else in repo or docs that says "run `just test-unit` to validate everything" needs updating. Scan reveals: `AGENTS.md` references `just test-unit` once (in the commands list); no semantic claim of completeness. Most callers (CI, dev docs) use `just check`.
- **Integration coverage:** Behavior preservation is the entire correctness story; per-unit verification handles this.
- **Unchanged invariants:** Every NixOS module under `nix/` is unchanged. Every TS module outside `tools/testing/nix/` and `tools/testing/standards/` is unchanged. The `bun test` runner, `bunfig.toml` pattern, and Bun's preload chain are unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| A batched fixture loses the per-scenario failure isolation Bun previously gave (one bad scenario could now red the eval for all tests in that file). | The current per-test eval cost was the problem; per-test isolation was the cost we paid for it. If diagnostic value is lost, the next layer is the nix stderr from the single eval, which usually identifies the bad scenario by attrset path. Acceptable trade. |
| A scenario in `korri-kiosk-module-eval` may depend on JS-computed values smuggled through the override string (e.g., interpolating `FLAKE_ROOT`). If so, batching requires baking that value into the fixture at evaluation time. | All current overrides observed in the source are static Nix expressions. Verify during U2 implementation; if dynamic interpolation appears, narrow the batched scenarios to those that are static and document the dynamic ones explicitly as opt-outs (mirror the U7 pattern). |
| `bun test` discovery may follow symlinks or other path quirks that make `--path-ignore-patterns "**/tools/testing/nix/**"` miss some files. | The debug session already confirmed this flag works (took the suite from 685s to 13s). U8's standards test pins the flag. |
| The new `test-nix` recipe's slowness becomes a new pain point on `just check`. | Out of scope by design — but the wall-time drop from ~11 min to ≤ ~3 min (R6) makes `just check` viable. CI parallelism is a separate follow-up. |
| `flake.lock` updates change every batched scenario's eval-cache key simultaneously, defeating nix's incremental caching. | This is true today too; batching doesn't change it. Acceptable. |

---

## Documentation / Operational Notes

- `AGENTS.md` `Tooling commands` block lists `just test-unit | just test-e2e`. Add `just test-nix` to that list as part of U1's commit message body (don't edit `AGENTS.md` itself unless explicitly requested, per repo rules).
- After all units land, consider `/se-compound` capture for `docs/solutions/` covering: "When a TS test file's per-test cost is dominated by a subprocess spawn, batch the subprocess call at fixture-load and consume results from an in-memory attrset. See `tools/testing/nix/korri-desktop-build-graph.test.ts` as exemplar." This pattern is generally applicable beyond nix tests.

---

## Sources & References

- Origin debug session: this conversation's earlier turns; root-cause confirmed via `bun test --path-ignore-patterns "**/tools/testing/nix/**"` → 13s vs. unflagged 685s, and a single `nix eval` of `korri-kiosk-module-eval.fixture.nix` measuring 12.1s.
- Working batched-fixture precedent: `tools/testing/nix/korri-desktop-build-graph.test.ts` and `tools/testing/nix/korri-desktop-build-graph.fixture.nix`.
- Recipe layout reference: `justfile` `test-unit`, `test`, `check` lines.
- Bun CLI: `bun test --help` (specifically `--path-ignore-patterns`).
- Related plan (just completed, same atomic-commit + TDD cadence): `docs/plans/2026-05-24-004-refactor-renderer-bun-boundary-plan.md`.
