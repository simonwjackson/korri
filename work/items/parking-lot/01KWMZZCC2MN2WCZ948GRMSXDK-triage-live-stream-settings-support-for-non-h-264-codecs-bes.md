---
id: 01KWMZZCC2MN2WCZ948GRMSXDK
slug: triage-live-stream-settings-support-for-non-h-264-codecs-bes
title: Triage live stream-settings support for non-H.264 codecs (best-effort + honest reporting)
origin: parked
status: To Do
priority: medium
labels:
  - runtime-settings
  - sunshine
  - moonlight
  - codec
  - capabilities
  - follow-up
created: 2026-07-03
source: user
---

# Triage live stream-settings support for non-H.264 codecs (best-effort + honest reporting)

## Why it matters

Live quality controls currently light up only on H.264 because the runtime-settings apply path is validated there, and SM8550 commits H.264 as the default. Users may run H.265/HEVC or AV1 and still want live bitrate/FPS/resolution. We should triage which runtime operations are actually attemptable per codec, attempt them best-effort where a real path exists, and report honestly (unsupported/failed) where they don't — instead of a blanket codec gate that hides the capability. This keeps the accept-and-adapt philosophy consistent across codecs rather than special-casing H.264 forever.

## Acceptance Criteria

- [ ] Per-codec matrix documents which runtime operations (bitrate/FPS/resolution) are attemptable on the validated host/client stack (H.264, HEVC/H.265, AV1).
- [ ] Non-H.264 sessions attempt best-effort apply where a real encoder path exists and return honest unsupported/failed outcomes otherwise, with no reconnect/restart/encoder-restart fallback.
- [ ] Capability advertisement reflects per-codec reality (per-operation) once validated, rather than a single H.264-only gate.
- [ ] Applied-truth reporting still holds: a change only shows applied when the readback matches the request.
- [ ] Evidence captured per codec on the validated device profile.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `product/vendor/sunshine-korri/README.md`
- `product/vendor/moonlight-embedded-korri/README.md`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
