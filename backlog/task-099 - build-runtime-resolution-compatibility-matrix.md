---
id: task-099
title: Build runtime-resolution compatibility matrix
status: To Do
priority: medium
labels:
  - live-resolution
  - compatibility
  - upstream
  - docs
created: 2026-06-02
source: user
---

# Build runtime-resolution compatibility matrix

## Why it matters

The current proof is specific: Sunshine VAAPI H.264 on aka and Moonlight Embedded V4L2M2M/SDL on bandai. Shipping or upstreaming needs clear scope across encoders, codecs, clients, and resolutions so users do not assume unsupported combinations work.

## Acceptance Criteria

- [ ] Matrix covers VAAPI/NVENC/software where relevant, H.264/HEVC/AV1, Moonlight Embedded/Qt where feasible, and target resolutions including 1080p/576p/360p
- [ ] Unsupported combinations are explicitly marked with failure mode or reason
- [ ] Product code gates runtime-resolution availability based on proven capability
- [ ] Docs include the validated Korri hardware/software profile

## Related

- `task-064`
- `task-085`
- `task-087`
- `task-088`
- `task-094`
- `packages/sunshine-korri`
- `packages/moonlight-embedded-korri`
