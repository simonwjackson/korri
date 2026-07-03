---
id: 01KWN2M3GSQPP1NBH3F1SQCDSK
slug: verify-never-stretch-geometry-end-to-end-for-arbitrary-aspec
title: Verify same-ratio scaling never distorts the image on device
origin: parked
status: To Do
priority: high
labels:
  - runtime-settings
  - never-stretch
  - moonlight
  - sunshine
  - device-validation
  - task-092
created: 2026-07-03
source: se-work
---

# Verify same-ratio scaling never distorts the image on device

## Scope correction (2026-07-03)

We only scale resolution along the stream's fixed aspect ratio; we never reshape
the stream. There is no letterbox/reshape feature and no "arbitrary aspect ratio"
support. A genuinely different-aspect request must be cleanly rejected, never
stretched.

## Why it matters

The contract mandates scale-only / never-stretch. Now that the client coerces
resolutions (round-to-even + clamp) we need to confirm on device that stepping
the resolution up and down along the same aspect ratio produces a correctly
proportioned image at every step, and that off-ratio requests are refused rather
than distorted. Presenting the fixed-aspect stream on the physical panel is a
separate, standard concern: the client scales uniformly and may pad with bars
where the panel's own shape differs, but it never fill-stretches and never
reshapes the stream.

## Acceptance Criteria

- [ ] On device, scaling along the same aspect ratio across several steps (e.g. 16:9: 1280x720, 960x540, 854x480) shows a correctly proportioned image at each step, with no stretch or distortion.
- [ ] A genuinely different-aspect request (e.g. 4:3 on a 16:9 stream) is cleanly rejected (invalid), not stretched.
- [ ] No letterbox/reshape of the stream itself is introduced.
- [ ] The client presents the fixed-aspect stream uniformly on the panel (bars only where the physical panel shape differs; never fill-stretch).

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `01KWN5M3AQR7TVMDDB0FHQ29GA`
- `product/vendor/moonlight-embedded-korri/patches/0011-reset-sdl-presenter-on-output-size-change.patch`
