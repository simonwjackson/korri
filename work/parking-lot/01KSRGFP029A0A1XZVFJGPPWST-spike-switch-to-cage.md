---
id: 01KSRGFP029A0A1XZVFJGPPWST
slug: spike-switch-to-cage
title: Spike switching the compositor to cage
origin: parked
legacy: task-003
status: To Do
priority: medium
labels:
  - spike
  - compositor
  - renderer
created: 2026-05-29
source: user
---

# Spike: switch to cage

## Context

Evaluate consolidating on [cage](https://github.com/cage-kiosk/cage) as the single compositor for the kiosk renderer and game-session flows, vs. the current mix.

## Why it matters

Cage is already in the picture for the portal/input-passthrough path. Consolidating on cage end-to-end could simplify the renderer ownership story; the spike answers whether cage can host a Steam/Moonlight game-session surface acceptably or whether a second compositor is structurally required.

## Acceptance Criteria

- [ ] Brief spike doc covering: cage hosting Steam/Moonlight surfaces, input passthrough behavior, multi-surface/overlay limitations, and how the kiosk + session hand-off would look.
- [ ] Yes/no recommendation and the blocking issues that would need to be solved before any migration plan.

## Related

- `docs/solutions/best-practices/electrobun-portal-via-localhost-bun-and-cage-input-passthrough-2026-05-27.md`
- `../01KSKBP82KPD8XQEF6PJ12C9RN-feat-kiosk-renderer-ownership-sessiond/plan.md`

## Notes

Spike only — do not migrate. Pair with task-002 (niri spike) when reviewing outcomes.
