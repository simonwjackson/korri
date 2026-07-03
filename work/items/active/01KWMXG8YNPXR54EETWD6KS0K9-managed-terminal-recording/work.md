---
title: Complete play recording on the sessiond-managed terminal
type: feat
status: active
date: 2026-07-03
---

# Complete play recording on the sessiond-managed terminal

The last wire of the per-user play-recording loop. Direct launches already
record (owner `ExitObserved` → `completeLaunch`), but on sessiond-managed
hosts the owner hands off after readiness and never fires that terminal, so
device plays don't record. `spawnViaSessiond` already observes the terminal
and surfaces it as `session.exited`; wire that promise to
`coordinator.completeLaunch(launchId)` so the managed path records too.

Graduated from parking lot: `item.md`.
Builds on: `work/items/active/01KWMWAT06R3JG4FBR7VTDYNCV-play-recording-loop/plan.md`.

## Progress

- Planned (see `plan.md`).
