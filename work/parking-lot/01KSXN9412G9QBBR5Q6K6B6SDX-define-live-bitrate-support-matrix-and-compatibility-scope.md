---
id: 01KSXN9412G9QBBR5Q6K6B6SDX
slug: define-live-bitrate-support-matrix-and-compatibility-scope
title: Define live bitrate support matrix and compatibility scope
origin: parked
legacy: task-064
status: To Do
priority: medium
labels:
  - docs
  - compatibility
  - support-matrix
  - runtime-settings
created: 2026-05-31
source: user
context:
---

# Define live bitrate support matrix and compatibility scope

## Why it matters

The validated path should not be overclaimed; users and code need a clear matrix for which hosts, encoders, clients, apps, and launch modes are supported versus intentionally unsupported.

## Acceptance Criteria

- [ ] Document the supported matrix, including `h264_vaapi` plus the proven SM8550 Moonlight `v4l2m2m` path.
- [ ] Document unsupported/default-unsupported cases for other encoders, codecs, clients, and unproven app/launch modes.
- [ ] Decide whether the claim is Bandai/Aka-specific or applies to all `h264_vaapi` hosts with SM8550 `v4l2m2m` clients.
- [ ] Validate `Korri Stream`/Neverball product streaming specifically if it is included in the support claim, not only `Desktop`.
- [ ] If broader support is claimed, validate at least one additional host/client combination or explicitly defer it.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `packages/sunshine-korri/README.md`
- `packages/moonlight-embedded-korri/README.md`
- `docs/acceptance/sunshine-korri-seamless-vaapi-runtime-bitrate-sm8550-2026-05-31.md`
- `korri/products/app/api/stream/compose-moonlight-launch-spec.ts`

## Notes

This should be kept aligned with product capability gating.
