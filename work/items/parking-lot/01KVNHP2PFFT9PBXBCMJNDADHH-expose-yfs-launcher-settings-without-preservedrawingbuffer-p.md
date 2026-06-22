---
id: 01KVNHP2PFFT9PBXBCMJNDADHH
slug: expose-yfs-launcher-settings-without-preservedrawingbuffer-p
title: Expose YFS launcher settings without preserveDrawingBuffer penalty
origin: parked
status: To Do
priority: medium
labels:
  - yfs
  - settings
  - performance
  - web-canvas
created: 2026-06-21
source: user
---

# Expose YFS launcher settings without preserveDrawingBuffer penalty

## Why it matters

YFS has its own game settings (audio, GBA sounds, quick death, play timer, BGM/SFX volume, debug/metrics) that belong on the YFS launcher, but the old helper also forced preserveDrawingBuffer for boot-frame capture, which can hurt WebGL performance and is not needed for the proven 120fps path.

## Acceptance Criteria

- [ ] Define strict YFS launcher settings schema for audio, GBA sounds, quick death, play timer, BGM volume, SFX volume, debug, and metrics
- [ ] Implement a YFS settings helper derived from `direct-launch-pre.js` but with the WebGL `preserveDrawingBuffer` patch removed
- [ ] Settings helper runs before/with the YFS loader through the internal ordered shim bundle
- [ ] Document why preserveDrawingBuffer is intentionally absent from the default path
- [ ] On Sobo, enabling settings does not regress hardware WebGL or the ~120fps-class rAF cadence beyond an agreed threshold

## Related

- `product/plugins/yoshis-fabrication-station/scripts/direct-launch-pre.js`
- `product/plugins/yoshis-fabrication-station/scripts/direct-launch.js`
- `docs/research/yoshis-fabrication-station-browser-runtime-capture.md`

## Notes

Decision: reuse old helper minus risky part; do not carry the boot-frame capture/preserveDrawingBuffer hack into default launcher behavior.
