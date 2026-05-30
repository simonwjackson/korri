---
id: task-002
title: Spike switching the compositor to niri
status: To Do
priority: medium
labels:
  - spike
  - compositor
  - renderer
created: 2026-05-29
source: user
---

# Spike: switch to niri

## Context

Evaluate replacing the current compositor (gamescope/cage path used by the kiosk renderer and session/portal flows) with [niri](https://github.com/YaLTeR/niri).

## Why it matters

Compositor choice drives input passthrough, surface ownership, multi-window behavior, and renderer/session integration. A short spike clarifies whether niri's scrollable-tiling + Wayland-native posture is a better fit for the kiosk + portal + game-session split than the current stack before any migration plan is written.

## Acceptance Criteria

- [ ] Brief spike doc summarizing niri's fit vs. the current compositor for: kiosk renderer ownership, input device passthrough, Wayland protocol coverage we depend on, and game-session handoff.
- [ ] Yes/no recommendation with the one or two blocking issues that would have to be solved before a real migration plan.

## Related

- `docs/solutions/best-practices/electrobun-portal-via-localhost-bun-and-cage-input-passthrough-2026-05-27.md`
- `docs/plans/2026-05-27-004-feat-kiosk-renderer-ownership-sessiond-plan.md`

## Notes

Spike only — do not migrate. If the recommendation is yes, promote to `se-plan`.
