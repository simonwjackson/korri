---
title: Bun test coverage via a separate bunfig.coverage.toml
last_updated: 2026-05-29
date: 2026-05-29
category: tooling-decisions
module: bunfig + justfile + bun test
problem_type: tooling_decision
component: testing
severity: medium
applies_when:
  - "Setting up bun coverage on a project that uses bunfig.toml preloads (happy-dom, mock-import-meta)"
  - "Discovering that `bun test --coverage` silently produces no output"
  - "Wiring a baseline coverage report for a multi-file slice"
tags: [bun, coverage, testing, tooling, bunfig, justfile]
---

# Bun test coverage via a separate bunfig.coverage.toml

## Context

`task-037` investigated why `bun test --coverage` silently produced no output in this repo. The root cause is a **bun 1.3.3 CLI/config interaction**, not a happy-dom preload conflict as originally hypothesized.

### Reproduction (confirmed)

With `bunfig.toml` containing `coverage = false` and any non-empty `preload` chain:

```bash
$ bun test --coverage --coverage-reporter=text tools/device/sessiond-state.test.ts
# Tests pass. NO coverage output. NO coverage/ directory created. NO error.
```

The CLI `--coverage` flag is silently ignored when `coverage = false` is set in bunfig. Coverage only activates when bunfig itself declares `coverage = true`.

### What we ruled out

- **Happy-dom preload interference.** Removing each preload individually still produces no output. Adding only `setup-global.ts` (which has no external imports) and toggling `coverage = true` in bunfig produces a coverage table; this disproves the "happy-dom breaks instrumentation" hypothesis.
- **Module resolution.** Tests pass cleanly with all four preloads active when `coverage = true` is set in bunfig.
- **Reporter format.** Both `text` and `lcov` reporters are affected.
- **Bun version.** Confirmed on bun `1.3.3 (274e01c7)`.

## Decision

Use a **separate `bunfig.coverage.toml`** rather than toggling `coverage = true` in the main `bunfig.toml`.

```toml
# bunfig.coverage.toml — identical to bunfig.toml except:
coverage = true
coverageReporter = ["text", "lcov"]
coverageDir = "out/coverage"
# No coverageThreshold (see "Why no threshold" below).
```

Invoke with `bun --config=bunfig.coverage.toml test [paths...]`. Wired into the `justfile` as two recipes:

- `just test-coverage [paths...]` — coverage on an arbitrary slice.
- `just test-coverage-sessiond` — coverage on the task-009 sessiond test slice.

## Why this shape

- **Coverage instrumentation has measurable cost.** Setting `coverage = true` in the main bunfig would slow every dev-loop `bun test` invocation. The dev loop is the hot path; coverage is the cold path.
- **Coverage runs target a slice, not the whole suite.** The sessiond baseline command runs 24 test files, not 204. The bunfig delineation matches the invocation pattern.
- **`bun --config=<path>` is a first-class CLI flag.** No shell wrapper needed.

## Why no coverageThreshold

A focused test slice pulls in unrelated production files via the import graph (e.g., `library-source-layer-live.ts`, `game-assets-service.ts`) that aren't exercised by the slice. A single aggregate threshold treats the entire imported tree uniformly, so the threshold either:

- Fails on unrelated low-coverage files (the slice is great but aggregate is dragged down), or
- Passes because the threshold is too low to catch genuine slice regressions.

bun does not expose a file-include/exclude option for coverage as of 1.3.3. Threshold enforcement is **task-009's territory** once the include/exclude story is sorted (likely via test-file partitioning + per-slice thresholds).

For now, coverage runs report numbers; enforcement is via human review of the per-file delta in PRs that change the sessiond surface.

## Baseline (2026-05-29)

Captured via `just test-coverage-sessiond` against trunk after task-036 shipped. 314 sessiond-slice tests / 0 fail / 733 expect() calls.

### Sessiond surface coverage

| File | % Funcs | % Lines | Uncovered |
|---|---|---|---|
| `tools/device/sessiond.ts` | **77.36** | **71.97** | 294, 363, 410-417, 424-431, 480-488, 536-544, 557-561, 574, 576, 623-628, 708-711, 731, 750-752, 805-816, 824-853, 954-965, 972-982, 995-1023, 1028-1034, 1040-1047, 1054-1057, 1060-1100, 1105-1106 |
| `tools/device/sessiond-state.ts` | 100.00 | 94.74 | 84-88 |
| `tools/device/sessiond-role.ts` | 100.00 | 100.00 | — |
| `tools/device/sessiond-source-machine.ts` | 91.67 | 94.44 | 139-141, 191-192 |
| `tools/device/sessiond-electrobun.ts` | 78.95 | 69.47 | 39-41, 186-191, 194-195, 201-208, 211-243, 247-252 |
| `tools/device/sessiond-gamescope-reaper.ts` | **50.00** | **55.92** | 105-108, 130-134, 176-177, 184-187, 197-200, 204-207, 220-254, 262-270 |
| `tools/device/sessiond-launcher-client.ts` | 100.00 | 100.00 | — |
| `tools/device/sessiond-renderer.ts` | 100.00 | 100.00 | — |
| `tools/device/sessiond-status-sidecar.ts` | 100.00 | 95.52 | 87-89 |
| `tools/device/sessiond-sway.ts` | 100.00 | 100.00 | — |
| `tools/device/sessiond-smoke.ts` | **50.00** | **46.77** | 23, 47-65, 69-76, 81-84 |
| `korri/shared/library/session-launcher.ts` | 90.38 | 91.33 | 197-200, 267-273, 278-282, 284-291, 302-309, 490-492, 564-567, 585-586, 654-655 |
| `korri/shared/library/sessiond-managed-launch-protocol.ts` | 88.89 | 96.49 | 64, 312-316 |
| `korri/shared/library/launcher.ts` | 100.00 | 100.00 | — |
| `korri/shared/library/launcher-layer-memory.ts` | 84.21 | 84.80 | 84-90, 92, 113-120, 133, 172-173 |
| `korri/shared/library/launcher-layer-live.ts` | **0.00** | **22.22** | 7-15, 17-35 |
| `korri/shared/stream/foreground-session-owner.ts` | 96.55 | 95.61 | 391-397, 417-419, 421-428 |
| `korri/shared/stream/foreground-session-lifecycle.ts` | 100.00 | 97.19 | 416, 438-440 |
| `korri/shared/stream/foreground-session-gate-state.ts` | 100.00 | 100.00 | — |
| `korri/shared/stream/foreground-session-status.ts` | 100.00 | 99.12 | — |
| `korri/shared/stream/foreground-session-status-source.ts` | **0.00** | **22.22** | 1-7 |
| `korri/products/app/api/library/launch.rpc-handler.ts` | 79.17 | 86.32 | 156-164, 180-185, 189-193, 264-271, 367-374, 385-388, 397-398 |
| `korri/products/app/api/library/local-foreground-launch-adapter.ts` | 95.00 | 85.29 | 55-69, 231-235, 238-242, 344-348 |
| `korri/products/app/api/server/status.rpc-handler.ts` | 86.36 | 89.60 | 104-105, 127-128, 141-145, 298-304, 314-318 |
| `korri/products/app/features/home/foreground-session-status-layer-live.ts` | 100.00 | 100.00 | — |

### Highest-value gaps (task-009 target list)

Ordered by `(impact × delta)`:

1. **`tools/device/sessiond.ts`** (77.36 / 71.97) — the daemon dispatcher. Largest production file, 300+ uncovered lines centered on the managed-launch HTTP/SSE endpoints (`/managed-launch`, `/managed-launch/events`, `/managed-launch/terminate`), session-lifecycle branches, and error/recovery paths. Closing this is task-009's heaviest lift.
2. **`tools/device/sessiond-gamescope-reaper.ts`** (50.00 / 55.92) — Gamescope process/cgroup discovery. Likely needs harness doubles that simulate process trees.
3. **`tools/device/sessiond-smoke.ts`** (50.00 / 46.77) — operator smoke harness. May be acceptable as low-coverage since it's a development tool, but should be confirmed.
4. **`tools/device/sessiond-electrobun.ts`** (78.95 / 69.47) — renderer hand-off. Restore-path branches.
5. **`korri/shared/library/launcher-layer-live.ts`** (0.00 / 22.22) — the live `Launcher` Effect Layer; intentionally thin and arguably acceptable as 0% if only constructed in production wiring.
6. **`korri/shared/stream/foreground-session-status-source.ts`** (0.00 / 22.22) — verify this isn't dead code (the snapshot module path).
7. **`korri/products/app/api/library/launch.rpc-handler.ts`** (79.17 / 86.32) — uncovered lines are likely on the host-control-disabled/sessiond-managed branches.

## Consequences

- Coverage tooling is no longer "silently broken" — `just test-coverage` and `just test-coverage-sessiond` produce text + lcov output on demand.
- task-009's AC #1 (coverage tooling wired with baseline + repeatable command) is satisfied. The other ACs (close gaps to 100%) become a sequence of focused PRs against the file list above.
- The main bunfig stays unchanged for the dev loop; coverage instrumentation is opt-in.

## What this is NOT

- **NOT a CI gate.** No CI workflow runs coverage today. Wiring CI is a follow-on if/when task-009 sets a per-file threshold.
- **NOT a per-PR gate.** Threshold enforcement is deferred to task-009 because of the file-include/exclude issue described above.
- **NOT a fix for bun's CLI flag handling.** A bun bug report could be filed; for now the workaround is sufficient.

## Cross-references

- backlog/task-037 - investigate-bun-coverage-with-happy-dom-preload.md (the investigation that produced this decision)
- backlog/task-009 - sessiond-100-percent-test-coverage.md (the consumer of the baseline + recipe)
- `bunfig.toml` (the main dev-loop config; unchanged)
- `bunfig.coverage.toml` (the coverage-enabled sibling)
- `justfile` recipes `test-coverage` and `test-coverage-sessiond`
