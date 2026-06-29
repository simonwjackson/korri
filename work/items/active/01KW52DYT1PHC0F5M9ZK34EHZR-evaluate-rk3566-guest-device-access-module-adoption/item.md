---
id: 01KW52DYT1PHC0F5M9ZK34EHZR
slug: evaluate-rk3566-guest-device-access-module-adoption
title: Evaluate RK3566 guest device-access module adoption
origin: parked
status: To Do
priority: medium
labels:
  - rocknix
  - nix
  - device-access
created: 2026-06-27
source: se-work
---

# Evaluate RK3566 guest device-access module adoption

## Why it matters

The new RockNIX guest device-access module is intentionally enabled only for SM8550. RK3566 has a different root-compositor/main-space-audio posture, so adopting the shared module should be an explicit platform decision rather than an accidental inheritance.

## Acceptance Criteria

- [ ] RK3566 platform posture is reviewed against the shared guest device-access module options.
- [ ] Either RK3566 explicitly enables the module with platform-appropriate options and checks, or a documented decision explains why it remains disabled.
- [ ] No SM8550-only ACL, TTY, backlight, or udev assumptions are inherited by RK3566 without checks.

## Related

- `product/systems/nixos/modules/korri-rocknix-guest-device-access.nix`
- `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
- `work/items/active/01KW4ZJ9QBTEFJRQQN1Y2M0W2V-rocknix-guest-device-access/plan.md`
