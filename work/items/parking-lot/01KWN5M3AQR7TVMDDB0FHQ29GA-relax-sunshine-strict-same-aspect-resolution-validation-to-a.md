---
id: 01KWN5M3AQR7TVMDDB0FHQ29GA
slug: relax-sunshine-strict-same-aspect-resolution-validation-to-a
title: Tolerate integer-rounding aspect deltas so same-ratio scaled resolutions apply
origin: parked
status: To Do
priority: high
labels:
  - runtime-settings
  - sunshine
  - never-stretch
  - accept-and-adapt
  - task-092
  - device-evidence
created: 2026-07-03
source: user
---

# Tolerate integer-rounding aspect deltas so same-ratio scaled resolutions apply

## Scope correction (2026-07-03)

We only ever SCALE resolution along the fixed content aspect ratio (same shape,
fewer/more pixels). We NEVER change the stream aspect ratio. Forcing a different
shape would stretch the game (we cannot tell the game to re-render at a new
aspect), so that is explicitly not a supported feature. The host correctly
rejecting genuinely different aspect ratios is the guardrail against stretching
and must stay. There is no letterbox/reshape feature.

## Why it matters

Device evidence (bandai, 2026-07-03): with the stream applied at 1024x576 (exact
16:9), requesting 854x480, 640x480, or 426x240 returns runtime.setResolution ->
invalid. The host enforces an EXACT aspect match. The real bug is that a
legitimate same-ratio scale-down like 854x480 is rejected over a sub-pixel
rounding difference: true 16:9 at 480px height is 853.33, which cannot be an even
integer, so no even-integer 480p resolution is exactly 16:9. Adaptive scaling
therefore cannot step to common lower resolutions, even though they are the same
shape for all practical purposes (854x480 differs from exact 16:9 by ~0.08%).

The fix is tolerance, not "accept anything": accept a requested resolution when
its aspect ratio is within the small delta inherent to rounding to even
dimensions, and coerce to the nearest even dimensions that best preserve the
stream ratio. Keep rejecting genuinely different aspect ratios (e.g. 4:3 on a
16:9 stream) so the game is never stretched.

## Acceptance Criteria

- [ ] Host accepts a same-ratio scaled resolution that differs from the stream aspect only by even-integer rounding (e.g. 854x480, 960x540, 1280x720 on a 16:9 stream) instead of returning invalid.
- [ ] Host still rejects a genuinely different aspect ratio (e.g. 640x480 4:3 on a 16:9 stream); it does not stretch and does not letterbox/reshape the stream.
- [ ] The accepted aspect tolerance is derived from even-dimension rounding, not an arbitrary loose margin.
- [ ] Coercion for encoder constraints (alignment, min/max) still applies.
- [ ] Verified on device: 854x480 applies on a 16:9 stream; a 4:3 request is cleanly rejected (not stretched).
- [ ] sunshine-korri builds via its runtime patch check.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `product/vendor/sunshine-korri/patches/0004-add-proof-gated-runtime-resolution-apply-path.patch`
- `01KWN2M3GSQPP1NBH3F1SQCDSK`
