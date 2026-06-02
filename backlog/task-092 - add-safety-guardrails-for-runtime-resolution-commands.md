---
id: task-092
title: Add safety guardrails for runtime resolution commands
status: To Do
priority: high
labels:
  - streaming
  - safety
  - runtime-resolution
  - protocol
created: 2026-06-02
source: user
---

# Add safety guardrails for runtime resolution commands

## Why it matters

Runtime resolution changes now work, but unsafe sizes or rapid command sequences can still destabilize encoders, decoders, or scaling paths.

## Acceptance Criteria

- [ ] Allowed runtime resolutions are explicitly bounded and aligned to codec-safe dimensions.
- [ ] Command sequencing prevents overlapping resolution/bitrate/fps mutations that race the encoder generation boundary.
- [ ] Commands report local rejection for unsafe sizes before reaching Sunshine.
- [ ] Guardrails are covered by protocol/client tests and hardware smoke cases.

## Related

- `korri/shared/stream/moonlight-control-protocol.ts`
- `packages/moonlight-embedded-korri/patches/0008-add-runtime-set-resolution-on-local-control.patch`
- `packages/sunshine-korri/patches/0004-add-proof-gated-runtime-resolution-apply-path.patch`

## Notes

The protocol already has min/max concepts and proof-gated operations. Extend that into a product-safe ladder, especially around 640x360 and coded-height padding.
