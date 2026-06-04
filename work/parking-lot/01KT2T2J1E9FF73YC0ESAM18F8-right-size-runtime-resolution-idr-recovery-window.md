---
id: 01KT2T2J1E9FF73YC0ESAM18F8
slug: right-size-runtime-resolution-idr-recovery-window
title: Right-size runtime-resolution IDR recovery window
origin: parked
legacy: task-084
status: To Do
priority: high
labels:
  - streaming
  - performance
  - runtime-resolution
created: 2026-06-02
source: user
---

# Right-size runtime-resolution IDR recovery window

## Why it matters

The current working branch used a brute-force 1800-frame fresh-IDR window during investigation. That may preserve the demo but can waste bandwidth and conceal weaker stream boundary handling.

## Acceptance Criteria

- [ ] Determine the minimum reliable IDR/keyframe policy needed after runtime resolution changes.
- [ ] Replace the 1800-frame forced-IDR diagnostic window with a smaller bounded policy if validation passes.
- [ ] Validate 1080p -> 640x360 -> 1080p on bandai with moving content and no freeze.
- [ ] Measure bitrate impact before and after the change.

## Related

- `packages/sunshine-korri/patches/0010-extend-runtime-resolution-fresh-idr-window.patch`
- `packages/sunshine-korri/patches/0012-persist-runtime-config-and-reinit-capture-after-resolution.patch`

## Notes

Earlier 120-frame window was not enough before the final capture-reinit/skip-flush fix existed. Re-test now that the real generation boundary works.
