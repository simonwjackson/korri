---
id: task-016
title: Harden source-machine idle-blank readiness
status: Done
priority: medium
labels:
  - sessiond
  - source-machine
  - gamescope
  - readiness
created: 2026-05-29
source: user
---

# Harden source-machine idle-blank readiness

## Context

In the source-machine role, `sessiond` restores to an idle-blank graphical host: Sway remains alive, no Korri GUI client is present, no foreground app windows remain, no Gamescope residue remains, and a cooldown has elapsed before `idle-ready` is emitted.

## Why it matters

Source-machine hosts are remote streaming surfaces. If idle-ready fires too early, Sunshine/Moonlight can capture stale Gamescope windows, lingering processes, or a compositor still settling after exit.

## Acceptance Criteria

- [ ] Idle-blank evaluator covers ready, waiting, clear-foreground, and clear-processes decisions.
- [ ] Restore flow clears lingering Gamescope-selected Sway windows.
- [ ] Restore flow waits or fails predictably when `gamescope-wl` / `gamescopereaper` processes linger.
- [ ] Cooldown behavior is deterministic under test with injected clock/delay.
- [ ] Surface repair hook success/failure is covered and failure maps to host-unavailable/recovery behavior.
- [ ] `idle-ready` includes evidence for windows, processes, and cooldown checks.
- [ ] Source-machine image/module wiring provides the needed compositor/runtime/status paths.

## Related

- `tools/device/sessiond-source-machine.ts`
- `tools/device/sessiond-gamescope-reaper.ts`
- `tools/device/game-stream-fullscreen.ts`
- `tools/device/sessiond-status-sidecar.ts`
- `tools/device/sessiond.ts`
- `nix/images/source-machine.nix`
- `nix/modules/korri-game-stream.nix`
- `docs/plans/2026-05-27-002-feat-foreground-session-source-machine-phase4c-plan.md`

## Notes

This can be tackled independently from kiosk readiness because the role invariant and terminal event are different (`idle-ready` vs `home-ready`).
