---
id: 01KTYEEYF5T853A8RJWRAMGSYF
slug: evaluate-mesa-26-x86-64-turnip-inside-steam-fex-rootfs
title: Evaluate Mesa 26 x86_64 Turnip inside Steam FEX rootfs
origin: parked
status: Done
priority: medium
labels:
  - steam
  - fex
  - mesa
  - turnip
  - sm8550
created: 2026-06-12
source: se-work
---

# Evaluate Mesa 26 x86_64 Turnip inside Steam FEX rootfs

## Why it matters

30XX is now playable by restoring the Arch FEX rootfs x86_64 Freedreno ICD, but that rootfs currently carries Mesa 25.3.3 while Ryubing required Mesa 26.x for full SM8550 Turnip performance. Steam/Proton/FEX may need a separate x86_64 Mesa 26 rootfs or FEX Vulkan-thunk path rather than the native-aarch64 Ryubing wrapper or global system Mesa bump.

## Acceptance Criteria

- [x] Document whether Steam/Proton/FEX Windows titles on SM8550 benefit from x86_64 Mesa 26 versus the current Arch rootfs Mesa 25.3.3
- [x] If needed, provide a durable Steam-scoped Mesa 26 x86_64 Freedreno route without overwriting guest rootfs libraries with aarch64 host libraries
- [x] Verify 30XX still launches, maps libvulkan_freedreno.so, opens /dev/dri/renderD128, and remains playable after the change

## Related

- `product/systems/nixos/modules/korri-steam.nix`
- `product/vendor/steam-korri/scripts/steam-guest-runtime-prep`
- `work/items/parking-lot/01KTWZ0EG83WQTF2DBCXA82WXF-bump-korri-nixpkgs-pin-for-system-wide-mesa-26-turnip-gl.md`

## Notes

Discovered while fixing 30XX: rootfs Mesa is 1:25.3.3-1; playable state uses x86_64 rootfs libvulkan_freedreno.so, not Ryubing's native-aarch64 Mesa 26 wrapper.

2026-06-12 exploration result:

- Staged a disposable copy of the FEX Arch rootfs at `/var/lib/korri/steam/fex-data/RootFS/ArchLinux-mesa26-20260612-174656`.
- Upgraded the staged rootfs to Mesa/Freedreno `1:26.1.2-1` for `mesa`, `lib32-mesa`, `vulkan-freedreno`, and `lib32-vulkan-freedreno`.
- Switched `/var/lib/korri/steam/fex-rootfs` to that staged rootfs and restarted Steam.
- 30XX still launched through Proton 10/FEX, mapped `/run/pressure-vessel/interpreter-root/var/pressure-vessel/gfx/main/usr/lib/libvulkan_freedreno.so`, opened `/dev/dri/renderD128`, and felt the same as Mesa 25.3.3.
- Stray AppID `1332010`, which the user reports did not work on the previous ROCKNIX-shipped version, launched without explicit Proton override through Proton 10/FEX. The live process `Stray-Win64-Shipping.exe` mapped the rootfs Freedreno Vulkan ICD and opened `/dev/dri/renderD128`.
- This is strong enough to commit to Mesa/Freedreno 26 as the Steam/FEX product direction, but the staged rootfs was created via exploratory live pacman with conflict/signature bypasses. Productization must use a pinned, verified overlay or rootfs build path, not the ad-hoc staging method.

Productized result:

- `korri-steam-prepare-fex-rootfs` now builds `/var/lib/korri/steam/fex-data/RootFS/ArchLinux-mesa26` from the official FEX Arch rootfs plus pinned Arch Linux Archive package overlays.
- The overlay pins Mesa/Freedreno `1:26.1.2-1` packages plus the runtime deps needed for the Freedreno ICD to load (`libdisplay-info`, `lib32-libdisplay-info`, `xcb-util-keysyms`, `lib32-xcb-util-keysyms`).
- The preparer verifies x86_64/i386 Freedreno ELF machine IDs and required dependency sonames before marking the overlay converged.
- Deployed Bandai generation `/nix/store/zk10vf3py1gni15v1yj69v683dhmlb6s-nixos-system-bandai-25.11pre-git` successfully converged the productized rootfs.
- Post-productization Stray launched through Proton 10/FEX, mapped `/run/pressure-vessel/interpreter-root/var/pressure-vessel/gfx/main/usr/lib/libvulkan_freedreno.so`, opened `/dev/dri/renderD128`, and the user reported performance felt good.
