---
id: 01KWSYPQ0VW56DS0EK1E5Q5VQD
slug: make-above-launch-ceiling-resolution-requests-clamp-or-expla
title: Make above-launch-ceiling resolution requests clamp-or-explain, not fail generically
origin: parked
status: To Do
priority: low
labels:
  - runtime-settings
  - resolution
  - moonlight
  - accept-and-adapt
  - error-clarity
  - cli
created: 2026-07-05
source: se-debug
---

# Make above-launch-ceiling resolution requests clamp-or-explain, not fail generically

## Why it matters

On device (2026-07-05), requesting a live resolution above the stream's launch-negotiated ceiling (e.g. 1920x1080 on a 1280x720-launched stream, whose host encoder surface is fixed at 720p) returns the generic CLI error `runtime command dispatch failed` with no reason. The operator cannot tell that the request exceeded the negotiated maximum versus some transient dispatch fault. This violates the accept-and-adapt / errors-never-silent philosophy used elsewhere (bitrate/FPS clamp to negotiated max; same-ratio resolution rounds to even). The resolution path should either clamp down to the negotiated ceiling (accept-and-adapt, matching bitrate/FPS) or reject with a clear, specific message like `exceeds negotiated maximum 1280x720`, so the math controller and humans get an actionable signal instead of an opaque failure.

## Progress (2026-07-05)

- **Clamp (accept-and-adapt) implemented** in patch `0019-clamp-runtime-resolution-to-launch-ceiling.patch`: the local-control state captures the launch resolution as a ceiling and clamps live resolution requests down to it (per-dimension, which preserves the aspect ratio for same-ratio requests: 1920x1080 -> 1280x720). Off-ratio requests stay off-ratio and are still rejected by Sunshine. Chosen behavior = clamp (matches bitrate/FPS), which is what the adaptive controller needs. Compile-verified via the moonlight control-protocol patch-check (EXIT 0).
- **Residual:** on-device runtime verification (that an above-ceiling request now coerces instead of failing) is pending -- blocked 2026-07-05 by the bandai<->aka federation being disconnected (no stream launchable). Also, genuinely non-ceiling failures (conflict/unsupported/host error) still surface as the generic message; the CLI could translate those tags more specifically, but the main above-ceiling case is now handled by clamping.

## Acceptance Criteria

- [x] A live resolution request above the launch-negotiated ceiling is clamped down to the ceiling, consistent with the bitrate/FPS accept-and-adapt behavior (patch 0019).
- [ ] The chosen behavior (clamp) is documented in the runtime-settings contract.
- [ ] On-device: an above-ceiling request coerces to the launch resolution (CLI shows the coerced value) instead of the generic 'runtime command dispatch failed'. (Runtime-verify when a stream is available.)
- [ ] (Residual, lower value) The CLI translates genuinely non-ceiling failure tags (conflict/unsupported) into specific messages via describeControlError.
- [ ] A test reproduces an above-ceiling request and asserts the clamp.

## Related

- `product/plugins/moonlight/packages/moonlight-embedded-korri/patches/0019-clamp-runtime-resolution-to-launch-ceiling.patch`
- `product/plugins/moonlight/packages/moonlight-embedded-korri/patches/0008-add-runtime-set-resolution-on-local-control.patch`
- `product/surfaces/terminal/korri-cli/stream-quality.ts`
- `docs/acceptance/runtime-settings-protocol-contract.md`
- `docs/korri-stream-resolution-switch-seamlessness-findings-2026-07-05.md`
