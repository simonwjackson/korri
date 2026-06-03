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

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `korri/shared/stream/moonlight-control-protocol.ts`
- `packages/moonlight-embedded-korri/patches/0008-add-runtime-set-resolution-on-local-control.patch`
- `packages/sunshine-korri/patches/0004-add-proof-gated-runtime-resolution-apply-path.patch`

## Notes

The runtime-settings protocol now treats resolution as a normal proven operation with positive-value protocol bounds. Extend that into product-level guardrails, validation evidence, and any ladder-specific policy without reintroducing protocol-level proof gates.
