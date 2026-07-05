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

## Acceptance Criteria

- [ ] A live resolution request above the launch-negotiated ceiling returns a specific, human-readable reason (e.g. names the negotiated max) OR is clamped down to the ceiling, consistent with the bitrate/FPS accept-and-adapt behavior.
- [ ] The chosen behavior (clamp vs explicit reject) is decided and documented in the runtime-settings contract.
- [ ] The CLI surfaces the specific reason/coercion (reuses the existing describeControlError / 'coerced to:' lines), not the generic 'runtime command dispatch failed'.
- [ ] A test reproduces an above-ceiling request and asserts the specific reason/clamp rather than the generic failure.

## Related

- `product/plugins/moonlight/packages/moonlight-embedded-korri/patches/0008-add-runtime-set-resolution-on-local-control.patch`
- `product/surfaces/terminal/korri-cli/stream-quality.ts`
- `docs/acceptance/runtime-settings-protocol-contract.md`
- `docs/korri-stream-resolution-switch-seamlessness-findings-2026-07-05.md`
