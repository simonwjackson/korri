---
id: 01KWDARX0QV51R9DMRXJRHYQGX
slug: make-launch-time-surface-closure-optional-with-guaranteed-re
title: Make launch-time surface closure optional with guaranteed restore
origin: parked
status: To Do
priority: medium
labels:
  - surface-lifecycle
  - sessiond
  - ux
created: 2026-06-30
source: user
---

# Make launch-time surface closure optional with guaranteed restore

## Why it matters

Closing the UI renderer during a game loses in-memory navigation/scroll/focus state and is especially fragile once multiple surfaces exist. If we reintroduce closure later, it needs a surface-state contract and restore proof instead of relying on relaunch/reconcile alone.

## Acceptance Criteria

- [ ] Launch policy can choose between keep-open, hide/quiesce, and close/relaunch per surface or profile.
- [ ] Each surface exposes enough state snapshot/restore hooks to return to the exact pre-launch route, selection, scroll/focus, modal, and transient UI state that matters.
- [ ] Sessiond records launch-bound surface snapshots and verifies post-game restoration before reporting home-ready.
- [ ] Failures degrade to a visible recovery state rather than silently losing context.

## Related

- `product/services/device/sessiond-role.ts`
- `product/services/device/sessiond-state.ts`
- `product/services/device/sessiond-renderer.ts`
- `product/services/device/sessiond-sway.ts`

## Notes

User wants current behavior removed for now: do not close Korri GUI on launch; backlog optional close/restore as a future capability.
