---
id: 01KVVXDWGSHXWXH42B7Y372X5Y
slug: productize-vkbasalt-post-processing-profiles-for-korri-launc
title: Productize vkBasalt post-processing profiles for Korri launches
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - retroarch
  - vkbasalt
  - post-processing
  - sobo
created: 2026-06-24
source: user
---

# Productize vkBasalt post-processing profiles for Korri launches

## Why it matters

The Sobo proof showed vkBasalt can layer obvious Vulkan post-processing and ReShade-style VHS effects over RetroArch launches, but it currently relies on ad-hoc store paths, hand-edited YAML profiles, and manually installed shader/config files. Productizing it would make whole-window effects reusable for RetroArch, native, Steam/Proton, and Gamescope-backed launches without fragile device-local setup.

## Acceptance Criteria

- [ ] A first-class launch/plugin setting enables vkBasalt without hand-editing environment variables.
- [ ] NixOS product modules can install `pkgs.vkbasalt` and optional curated shader/config assets into stable `/etc/korri` or `/var/lib/korri` paths.
- [ ] At least one curated profile exists for an obvious effect, e.g. active/corroded VHS, with documented expected visuals and performance caveats.
- [ ] Launch dry-runs expose the vkBasalt environment/config path so users can verify the selected profile before launch.
- [ ] Sobo smoke test proves a RetroArch Vulkan launch uses the productized vkBasalt profile; non-Vulkan/OpenGL limitations are documented.

## Related

- `product/plugins/retroarch/src/launch-spec.ts`
- `product/plugins/retroarch/src/policy.ts`
- `product/plugins/retroarch/nix/nixos-module.nix`
- `product/systems/nixos/flake/products.nix`
- `/var/lib/korri/vkbasalt/vkBasalt-active-vhs.conf on Sobo`
- `/var/lib/korri/reshade-shaders/Shaders/KorriActiveCorrodedVHS.fx on Sobo`

## Notes

Prototype profiles created on Sobo: `vkbasalt-neon-proof`, `vkbasalt-corroded-vhs`, and `vkbasalt-active-vhs`. Current demo uses nix store vkbasalt path `/nix/store/g7h3yqghmgfwrqbf0ql591yibalsvwz9-vkbasalt-0.3.2.10` in `XDG_DATA_DIRS`; productized version should avoid hardcoded store paths and support curated ReShade FX assets.
