---
id: 01KWX11NZD9KH56S1QM52R2BSQ
slug: reconcile-steam-compat-policy-before-raw-appid-launches
title: Reconcile Steam compat policy before raw AppID launches
origin: parked
status: To Do
priority: high
labels:
  - steam
  - bandai
  - proton
created: 2026-07-07
source: user
---

# Reconcile Steam compat policy before raw AppID launches

## Why it matters

Flinthook proved that launching an AppID outside the catalog/materializer path can bypass Korri's intended Cachy Proton default; Steam then chooses the native Linux depot for Linux-capable games and the game fails until a per-app Cachy mapping is written.

## Acceptance Criteria

- [ ] `korri-steam-app <appid>` ensures the configured default compat tool is present before forwarding the launch.
- [ ] Linux-native Steam titles that need Windows/Proton can be forced through Cachy without manual config edits.
- [ ] A regression test covers Flinthook AppID 401710 resolving to proton-cachyos before launch.

## Related

- `product/plugins/steam/nix/nixos-module.nix`
- `product/plugins/steam/src/state-materializer.ts`
- `work/items/active/01KVMD7VX7SYJ4W2FJHY2YAZYE-enforce-gamescoped-steam-big-picture-warm-gate/plan.md`

## Notes

Discovered during live Flinthook validation: config.vdf had only 1029210 mapped to proton-cachyos, so Steam launched /steamapps/common/Flinthook/./Flinthook until 401710 was explicitly mapped.
