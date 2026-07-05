---
id: 01KWR2SP6DJ56E7SFYPJXGZX3E
slug: reduce-micro-freeze-on-live-resolution-switch-device-evidenc
title: "Reduce micro-freeze on live resolution switch (device evidence: only resolution hitches)"
origin: parked
status: To Do
priority: medium
labels:
  - runtime-settings
  - resolution
  - moonlight
  - sunshine
  - v4l2m2m
  - performance
  - device-evidence
created: 2026-07-05
source: user
---

# Reduce micro-freeze on live resolution switch (device evidence: only resolution hitches)

## Why it matters

On device (bandai), switching resolution mid-stream causes a brief micro-freeze, while bitrate and FPS changes are seamless. That asymmetry is expected: bitrate/FPS are live parameters on a running pipeline, but a resolution change reconfigures the whole encode/decode pipeline — Sunshine rebuilds the encode session + emits a keyframe, the SM8550 v4l2m2m decoder reinitializes for the new size, and the SDL presenter recreates its texture/surface (patch 0011). Since resolution is a lever the adaptive controller will use to reclaim/shed pixels, this hitch is user-visible during automatic scaling. Need to isolate the dominant stall stage and reduce it, and keep resolution a last-resort lever so it is rarely felt.

## Acceptance Criteria

- [ ] Profiling isolates the dominant stall stage: host encoder restart vs client v4l2m2m decoder reinit vs SDL presenter surface recreate.
- [ ] Client uses the V4L2 dynamic-resolution-change (SOURCE_CHANGE) path — renegotiate CAPTURE buffers only — instead of full decoder destroy/recreate, where the SM8550 decoder supports it.
- [ ] Presenter resizes without a black flash and holds the last good frame across the swap (no black/frozen gap beyond a single frame).
- [ ] Host encoder path minimizes restart cost and emits a prompt IDR at the new size.
- [ ] On device, a same-ratio resolution step shows at most a single-frame hitch, not a multi-hundred-ms freeze.
- [ ] Adaptive controller treats resolution as the last-resort lever (strong hysteresis / large deadband) so switches are rare.

## Related

- `product/vendor/moonlight-embedded-korri/patches/0011-reset-sdl-presenter-on-output-size-change.patch`
- `product/platform/stream/stream-adaptive-controller.ts`
- `docs/acceptance/runtime-settings-protocol-contract.md`
