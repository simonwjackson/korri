---
id: task-015
title: Harden kiosk sessiond readiness invariants
status: Done
priority: medium
labels:
  - sessiond
  - kiosk
  - renderer
  - readiness
created: 2026-05-29
source: user
---

# Harden kiosk sessiond readiness invariants

## Context

In the kiosk role, `sessiond` owns the Electrobun/Korri home renderer lifecycle: launch home, stop it before a foreground app, restore it after exit, reconcile Sway windows, and emit `home-ready`. Readiness must mean the home invariant is satisfied, not merely that a process was spawned.

## Why it matters

Kiosk restore bugs are user-visible as black screens, duplicate windows, unfocused UI, or a host that claims it is ready while the renderer is unusable.

## Acceptance Criteria

- [ ] Kiosk role tests verify renderer launch, stop, restore, and reconcile flows through public role/sessiond behavior.
- [ ] Missing renderer window triggers relaunch and does not incorrectly emit ready before repair.
- [ ] Duplicate renderer windows are closed while preserving a primary window.
- [ ] Unfocused/non-fullscreen renderer window is repaired.
- [ ] `home-ready` includes meaningful evidence that the home invariant was satisfied.
- [ ] Restore failure enters `recovering` with useful failure reason and does not report ready.
- [ ] Kiosk image wiring still provides required Wayland/session/env/writable paths for renderer ownership.

## Related

- `tools/device/sessiond-role.ts`
- `tools/device/sessiond-state.ts`
- `tools/device/sessiond-electrobun.ts`
- `tools/device/sessiond-sway.ts`
- `tools/device/sessiond.ts`
- `nix/images/kiosk.nix`
- `docs/plans/2026-05-27-004-feat-kiosk-renderer-ownership-sessiond-plan.md`
- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`

## Notes

Pairs naturally with task-009 coverage work, but the invariant itself should remain a product/runtime contract rather than a coverage-only exercise.
