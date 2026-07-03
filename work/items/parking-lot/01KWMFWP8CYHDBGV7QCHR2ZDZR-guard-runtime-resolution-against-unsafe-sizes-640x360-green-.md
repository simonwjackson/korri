---
id: 01KWMFWP8CYHDBGV7QCHR2ZDZR
slug: guard-runtime-resolution-against-unsafe-sizes-640x360-green-
title: Guard runtime resolution against unsafe sizes (640x360 green screen on bandai H.264)
origin: parked
status: To Do
priority: high
labels:
  - runtime-settings
  - runtime-resolution
  - safety
  - streaming
created: 2026-07-03
source: user
---

# Guard runtime resolution against unsafe sizes (640x360 green screen on bandai H.264)

## Why it matters

During live stream-settings testing on bandai (H.264 / v4l2m2m decode), changing resolution to 640x360 turned the whole picture green. 640x360 is 16:9, but its height (360) is not aligned to the 16-pixel boundary hardware decoders often require, which corrupts the chroma plane and produces a green frame. This is exactly the failure mode the resolution safety guardrail (task-092) must prevent: the tool/product should reject or snap to codec-safe dimensions before sending, rather than letting the stream render garbage.

## Acceptance Criteria

- [ ] Runtime resolution changes are bounded to codec-safe dimensions (e.g. width/height aligned to the decoder's required multiple)
- [ ] Unsafe sizes are rejected locally with a clear message before reaching the host
- [ ] 640x360 on bandai H.264 is either rejected or snapped to a safe size instead of producing a green frame

## Related

- `work/parking-lot/01KT2T2J1N1W0680KVJ0ZKF5S9-add-safety-guardrails-for-runtime-resolution-commands.md`
- `tools/device/live-stream-quality.ts`

## Notes

Positive result from the same session: forcing H.264 on bandai let live bitrate/FPS/resolution changes apply successfully via the throwaway tool — Phase 1 mechanism validated on real hardware. The green screen only appeared at 640x360. Separately, a GUI/nested-gamescope crash on relaunch after reboot was observed and logged by the user under its own backlog item.
