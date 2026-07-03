---
id: 01KWN2M3GSQPP1NBH3F1SQCDSK
slug: verify-never-stretch-geometry-end-to-end-for-arbitrary-aspec
title: Verify never-stretch geometry end-to-end for arbitrary aspect ratios
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

# Verify never-stretch geometry end-to-end for arbitrary aspect ratios

## Why it matters

The contract mandates never-stretch: request any shape, get letterbox/pillarbox rather than distortion. Now that the client accepts arbitrary resolutions (coercion landed), we need to confirm the full pipeline preserves geometry: Sunshine is expected to letterbox the captured game into the requested stream frame, and the SM8550 v4l2m2m/SDL client presenter must scale uniformly (patch 0011 owns presenter reset; the base sdl_dst_rect scaling lives in nix-on-rocks). If a genuinely off-ratio request (e.g. an ultrawide or tall size on a 16:9 panel) shows a stretched image at Gate A, add a client letterbox/uniform-scale patch. This is inherently a device-visual check.

## Acceptance Criteria

- [ ] On device, requesting an aspect ratio different from the panel shows letterbox/pillarbox bars, never a stretched/distorted image.
- [ ] Verified for at least one wide and one tall off-ratio request.
- [ ] If the client fill-stretches, a presenter uniform-scale + letterbox patch is added and the check re-run.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `product/vendor/moonlight-embedded-korri/patches/0011-reset-sdl-presenter-on-output-size-change.patch`
