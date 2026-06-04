---
id: 01KT2T2J1K1EBDFD6CN4S0YDC3
slug: design-gamescope-scaling-policy-for-runtime-stream-changes
title: Design Gamescope scaling policy for runtime stream changes
origin: parked
legacy: task-090
status: To Do
priority: medium
labels:
  - gamescope
  - streaming
  - architecture
  - runtime-resolution
created: 2026-06-02
source: user
---

# Design Gamescope scaling policy for runtime stream changes

## Why it matters

For runtime stream resolution changes, Moonlight may present 640x360 video into a 1080p SDL output depending on launch flags and presenter behavior. The product needs an intentional policy for whether Moonlight or Gamescope owns scaling.

## Acceptance Criteria

- [ ] Document and test combinations of Gamescope outer size, inner -w/-h flags, Moonlight launch width/height, and runtime stream width/height.
- [ ] Choose whether scaling should happen in Moonlight SDL, Gamescope FSR, or another layer for each quality mode.
- [ ] Ensure runtime resolution changes still render fullscreen after the child video size changes.
- [ ] Add launch-spec/config fields only after the policy is validated on bandai.

## Related

- `korri/products/app/api/stream/compose-moonlight-launch-spec.ts`
- `korri/products/app/stream/moonlight-launcher.ts`
- `tools/device/game-stream-fullscreen.ts`

## Notes

Observed: no inner flags -> child/logical output 1080p. Forced -w 640 -h 360 -> child output 640x360. Runtime 1080p -> 360p after no-inner launch produced Moonlight log video=640x360 output=1920x1080, implying Moonlight SDL scaled to output.
