---
id: 01KVM5C8HVPWJYXNAHWXGY6E3V
slug: replace-proton-cachyos-arm64-fixture-with-validated-payload-
title: Replace proton-cachyos-arm64 fixture with validated payload artifact
origin: parked
status: To Do
priority: high
labels:
  - steam
  - proton
  - deployment
created: 2026-06-21
source: se-work
---

# Replace proton-cachyos-arm64 fixture with validated payload artifact

## Why it matters

The productized Steam/proton policy code is landed, but the checked-in proton-cachyos-arm64 source is a small fixture/contract slot, not the real validated multi-GB ARM64 proton-cachyos payload. Deploying an image without replacing it would register a non-functional compatibility tool and break Steam AppID launches.

## Acceptance Criteria

- [ ] The real proton-cachyos-11.0-20260601-slr-arm64 payload is supplied through the agreed out-of-tree/LFS/local-store artifact path.
- [ ] The proton-cachyos-arm64 derivation builds from that artifact and strips require_tool_appid from the real toolmanifest.vdf.
- [ ] A Bandai on-device smoke launch reaches gameplay with no EULA/interstitial prompt and the default compat tool in effect.

## Related

- `product/plugins/proton-runtime/packages/proton-cachyos-arm64/default.nix`
- `product/plugins/proton-runtime/packages/proton-cachyos-arm64/vendor/README.md`
- `work/items/active/01KVM124SW03GF7P1XZGKDSS4M-steam-arm64-proton-declarative-policy/plan.md`
- `commit 9bdddc6d`

## Notes

This is the remaining operational artifact step before deployment; code-level policy/provisioning landed in 9bdddc6d.
