---
id: 01KX6EHGX1AC8XXHK0T4WR6GKH
slug: fix-moonlight-runtime-resolution-upshift-stuck-at-launch-res
title: Fix Moonlight runtime resolution upshift stuck at launch resolution
origin: parked
status: To Do
priority: high
labels:
  - moonlight
  - adaptive-stream
  - bandai
  - runtime-control
created: 2026-07-10
source: user
---

# Fix Moonlight runtime resolution upshift stuck at launch resolution

## Why it matters

Bandai adaptive control repeatedly dispatches runtime.setResolution to 1510x850 and Moonlight reports the command as applied, but stream-state remains at the launch resolution 1280x720. Users see bitrate scale to max while resolution never improves, making adaptive quality misleading.

## Acceptance Criteria

- [ ] A Bandai→aka stream launched at 1280x720 can dynamically upshift resolution and `app.stream-control.state.get` readback reflects the new applied resolution.
- [ ] If runtime resolution switching is unsupported for the active Sunshine/Moonlight path, adaptive disables the resolution lever or reports an explicit unsupported/error state instead of looping applied commands.
- [ ] Tests cover an applied resolution command whose readback remains unchanged and prevent repeated no-op upshift loops.

## Related

- `product/platform/stream/stream-adaptive-runner.ts`
- `product/platform/stream/runtime-recovery-supervisor.ts`
- `product/plugins/moonlight/src/stream-control/runtime-session.ts`
- `product/vendor/moonlight-embedded-korri/patches/0008-add-runtime-set-resolution-on-local-control.patch`
- `product/vendor/moonlight-embedded-korri/patches/0009-reopen-v4l2m2m-decoder-on-output-size-change.patch`

## Notes

Observed live on Bandai 2026-07-10: bitrate reached 40000 and fps 120, adaptive repeatedly targeted 1510x850, Moonlight control `state.get` returned `lastCommand: runtime.setResolution status=applied` but `runtimeSettings.appliedResolution` and streamQuality width/height stayed 1280x720.
