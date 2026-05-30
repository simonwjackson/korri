---
id: task-037
title: Investigate bun test --coverage compatibility with happy-dom preload
status: Done
priority: medium
labels:
  - testing
  - tooling
  - infrastructure
  - sessiond
created: 2026-05-29
source: se-work
context:
  cwd: .
  branch: trunk
  repo: simonwjackson/korri
  invoked_by: se-work
---

# Investigate bun test --coverage compatibility with happy-dom preload

## Context

`task-009 - sessiond-100-percent-test-coverage` is blocked on AC #1 ("coverage tooling is wired for the sessiond-relevant test slice with a reported baseline and a repeatable command behind `just`"). The project uses `bun test` as the canonical unit test runner; `bunfig.toml` already declares the intent:

```toml
[test]
coverage = false
coverageReporter = ["text", "lcov"]
coverageThreshold = { lines = 80 }
```

But `bun test --coverage --coverage-reporter=text` produces no output and creates no coverage directory under the current preload setup:

```toml
preload = [
  "./tools/testing/mock-import-meta.ts",
  "./tools/testing/happydom.ts",
  "./tools/testing/testing-library.ts",
  "./tools/testing/setup-global.ts",
]
```

Suspected cause: `happydom.ts` calls `GlobalRegistrator.register()` which monkey-patches global timer functions and possibly disables bun's coverage instrumentation. Bun is version 1.3.3.

## Why it matters

Without working coverage tooling the entire task-009 scope is unmeasurable. AC #11 specifically requires `just test-unit`, `just test-nix`, `just lint`, `just typecheck`, and a new coverage command to exit green in CI. The current state is "tests pass but coverage is silent."

A working tool unblocks:
- task-009 baseline measurement and gap-closing PRs.
- Future test additions confident they actually exercise the targeted branches.
- CI coverage gating for the sessiond slice.

## Acceptance Criteria

- [ ] Reproduce the empty-coverage symptom in isolation: confirm whether removing each preload file restores coverage output.
- [ ] If happy-dom is the cause: investigate `--coverage` interaction with `GlobalRegistrator.register()`; check whether running test files that don't need DOM can opt out of the preload.
- [ ] If unfixable on current bun version: pin a working bun version OR document the workaround (e.g. partition tests into DOM vs non-DOM and run coverage on the non-DOM slice).
- [ ] Alternative path: evaluate `c8` or `nyc` wrapped around `bun test` and compare maintenance cost. Document the chosen path.
- [ ] Land a `just test-coverage` recipe that runs reliably on at least the sessiond-relevant test files (those listed in task-009 Related) and outputs text + lcov.
- [ ] Document the baseline coverage percentage in the recipe's comment (or in a small report file under `out/`).
- [ ] Verify the recipe runs under the project's CI environment and exits with a meaningful coverage signal.

## Related

- `bunfig.toml` (existing coverage config)
- `tools/testing/happydom.ts` (suspected interference)
- `tools/testing/mock-import-meta.ts`
- `justfile` (where the new recipe lives)
- backlog/task-009 - sessiond-100-percent-test-coverage.md (blocked on this)

## Notes

Captured during task-009 attempt in the long-session sweep. Bun's `--coverage` flag silently produced no output and created no `coverage/` directory; no error or warning surfaced. This is exactly the kind of tool-trust gap that bites quietly during a coverage push, so the investigation is worth doing before any "raise coverage to N%" work.

Acceptable outcomes:
1. Bun coverage works after a config change (best).
2. Bun coverage works after pinning a version (acceptable).
3. We switch to c8/nyc for the coverage command (acceptable; track the dependency cost).
4. We document a manual coverage methodology and accept that the AC's "100% target" is aspirational rather than mechanically enforced (last resort).

## Resolution (2026-05-29)

**Outcome 1 (best):** root-caused to a bun 1.3.3 CLI/config interaction — NOT a happy-dom preload conflict as originally hypothesized. With `coverage = false` in `bunfig.toml`, the CLI `--coverage` flag is silently ignored; coverage only activates when bunfig declares `coverage = true`. Each preload was disproved as the cause by individual ablation.

Shipped:
- `bunfig.coverage.toml` (separate coverage-enabled config; mirrors `bunfig.toml` otherwise).
- `just test-coverage [paths...]` recipe (arbitrary slice).
- `just test-coverage-sessiond` recipe (task-009 baseline slice; 24 test files covering the sessiond surface).
- `docs/solutions/tooling-decisions/bun-coverage-via-separate-config-2026-05-29.md` documenting the decision, the baseline (per-file numbers as of 2026-05-29), and the highest-value gaps for task-009 to close.

No CI gate, no per-PR threshold: deferred to task-009 because bun 1.3.3 has no file-include/exclude option for coverage, so the slice approach must mature before a meaningful threshold can be enforced.
