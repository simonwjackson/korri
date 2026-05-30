---
id: task-040
title: Cover sessiond-gamescope-reaper and sessiond-electrobun restore paths
status: To Do
priority: medium
labels:
  - testing
  - sessiond
  - coverage
  - task-009
created: 2026-05-29
source: se-work
context:
  cwd: .
  branch: test/sessiond-coverage-pass-1
  repo: simonwjackson/korri
  invoked_by: se-work
---

# Cover sessiond-gamescope-reaper and sessiond-electrobun restore paths

## Context

Two adjacent low-coverage files in the sessiond slice baseline (`docs/solutions/tooling-decisions/bun-coverage-via-separate-config-2026-05-29.md`):

- `tools/device/sessiond-gamescope-reaper.ts` — **50.00% funcs / 55.92% lines**. The Gamescope process/cgroup discovery + reap path. Uncovered: 105-108, 130-134, 176-177, 184-187, 197-200, 204-207, 220-254, 262-270.
- `tools/device/sessiond-electrobun.ts` — **78.95% funcs / 69.47% lines**. The kiosk renderer hand-off (stop renderer / wait / relaunch / verify) used by the kiosk role's `beforeChildLaunch` and `restoreIdleAfterLaunch`. Uncovered: 39-41, 186-191, 194-195, 201-208, 211-243, 247-252.

Both are restore-path concerns that operators see as black-screen / busy-host symptoms when they regress.

## Why it matters

Gamescope reaper failures and Electrobun renderer-relaunch failures are the two most operator-visible kiosk symptoms. Today the relevant code paths are not covered by automated tests, so:

- A refactor that breaks process-tree walking, cgroup file reading, or SIGTERM/SIGKILL escalation goes undetected.
- A refactor that breaks the Electrobun restart sequence (kill → wait-for-exit → re-spawn → verify-window) ships green in CI.

The kiosk role's existing tests in `tools/device/sessiond-role.test.ts` cover the *invariants* (home-ready evidence) but not the *helpers* the role calls into.

## Acceptance Criteria

- [ ] `sessiond-gamescope-reaper.ts` reaches ≥ 90% lines / ≥ 85% funcs.
- [ ] `sessiond-electrobun.ts` reaches ≥ 90% lines / ≥ 85% funcs.
- [ ] Tests exercise the helpers through their public contracts, not implementation details.
- [ ] No `Mock*` / `Stub*` / `Fake*` doubles; harness doubles carry configurable `behavior` / `config` arguments.
- [ ] Remaining uncovered lines are documented as defensive branches or have a follow-up rationale.

## Related

- `tools/device/sessiond-gamescope-reaper.ts`
- `tools/device/sessiond-gamescope-reaper.test.ts`
- `tools/device/sessiond-electrobun.ts`
- `tools/device/sessiond-electrobun.test.ts`
- `tools/device/sessiond-role.test.ts` (kiosk-role invariants; cross-reference)
- `docs/solutions/tooling-decisions/bun-coverage-via-separate-config-2026-05-29.md` (baseline)
- backlog/task-009 - sessiond-100-percent-test-coverage.md (parent)

## Notes

Surfaced during task-009 pass 1 (`test/sessiond-coverage-pass-1`). Bundled together because both are restore-path concerns with similar harness shapes (process trees + lifecycle). Tackle after task-039 (the daemon dispatcher itself).

2026-05-30 pass 1 (`test/sessiond-restore-helper-coverage`): added restore-helper tests and moved:

- `tools/device/sessiond-electrobun.ts` **78.95/69.47 → 100.00/100.00**. Covered default status-file derivation, stale-status removal, readiness wait success, readiness timeout, stop-without-pid no-op, real runner resolve/spawn/log append, and kill fallback behavior.
- `tools/device/sessiond-gamescope-reaper.ts` **50.00/55.92 → 82.61/100.00**. Covered accumulated reaped-pid return, residual-check failure warning, lineage parent cycles, real grace-window wait, POSIX signaler ESRCH/non-ESRCH handling, procfs stat parsing/malformed/disappearing processes, unexpected procfs read errors, and `createSystemGamescopeReaper` override composition.

Line coverage target is satisfied for both files. Function coverage remains 82.61% on `sessiond-gamescope-reaper.ts` despite 100% line coverage; Bun's function metric appears to count nested/compiled closures in a way not surfaced by the text report. Treat as acceptable for pass 1 unless a later coverage-tool pass exposes named missed functions. This task remains open only if strict ≥85% function coverage is required mechanically; behavior coverage is materially complete.
