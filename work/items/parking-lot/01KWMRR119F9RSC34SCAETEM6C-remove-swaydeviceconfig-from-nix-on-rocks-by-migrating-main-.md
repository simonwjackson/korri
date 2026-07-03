---
id: 01KWMRR119F9RSC34SCAETEM6C
slug: remove-swaydeviceconfig-from-nix-on-rocks-by-migrating-main-
title: Remove swayDeviceConfig from nix-on-rocks by migrating main-space + RK devices to neutral display facts
origin: parked
status: To Do
priority: low
labels:
  - nix-on-rocks
  - compositor
  - sway
  - display
  - tech-debt
created: 2026-07-03
source: se-work
---

# Remove swayDeviceConfig from nix-on-rocks by migrating main-space + RK devices to neutral display facts

## Why it matters

Stage 2 retired the korri-side compositor leak (korri now renders Sway from neutral rocknix.device.display facts), but swayDeviceConfig could NOT be removed from nix-on-rocks: its own guest/profiles/main-space.nix fallback Sway session still renders ${device.display.swayDeviceConfig} (evaluated by main-space-systemd-contract), and rk3326.nix/rk3566.nix define it plus guest-profile/rk3566 contract tests assert it. Full removal (plan U8/U9) requires porting main-space's renderer and the RK devices onto the neutral facts, then updating those contract tests — a substrate-internal effort beyond the SM8550 boundary item.

## Acceptance Criteria

- [ ] main-space.nix renders its fallback Sway from rocknix.device.display neutral facts
- [ ] rk3326/rk3566 devices expose neutral display facts and their contract tests assert those instead of swayDeviceConfig
- [ ] swayDeviceConfig option is removed from nix-on-rocks and nix flake check stays green

## Related

- `nix-on-rocks:guest/profiles/main-space.nix`
- `nix-on-rocks:guest/modules/rk3326.nix`
- `nix-on-rocks:guest/modules/rk3566.nix`
- `nix-on-rocks:nix/tests/guest-profile-contract.nix`
- `work/items/active/01KWMEQA5G7MV3RQWD0T16SV88-retire-swaydeviceconfig-neutral-display/plan.md`
