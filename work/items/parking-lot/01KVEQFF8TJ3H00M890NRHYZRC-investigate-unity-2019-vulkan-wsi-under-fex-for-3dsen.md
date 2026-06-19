---
id: 01KVEQFF8TJ3H00M890NRHYZRC
slug: investigate-unity-2019-vulkan-wsi-under-fex-for-3dsen
title: Investigate Unity 2019 Vulkan WSI under FEX for 3dSen
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - bandai
  - fex
  - turnip
  - unity
  - itchio
created: 2026-06-19
source: user
---

# Investigate Unity 2019 Vulkan WSI under FEX for 3dSen

## Why it matters

3dSen PC now reaches Turnip/Freedreno on bandai, but Unity 2019 crashes during Vulkan swapchain creation because SDL/window-system metadata resolves to backend 0. This blocks turning acquired itch.io payloads into a working launch profile for this paid owned game.

## Acceptance Criteria

- [ ] Reproduce 3dSen Linux build selecting Turnip Adreno 740 under FEX
- [ ] Identify why Unity 2019 reports Unsupported windowing backend 0 on Sway/Xwayland/Gamescope
- [ ] Produce a launcher that maps a visible 3dSen window or document a confirmed upstream/runtime limitation
- [ ] If viable, launch with a NES ROM from /srv/lakes/towada/gaming/games/nintendo-entertainment-system/

## Related

- `/var/lib/korri/content/games/3dsenpc/run-3dsenpc-linux-vulkan-x11.sh`
- `/var/lib/korri/content/games/3dsenpc/run-3dsenpc-linux-vulkan-sdl.sh`
- `product/plugins/fex-runtime/packages/fex-runtime/setup-env`
- `product/plugins/steam/nix/nixos-module.nix`

## Notes

Observed working Turnip selection: Unity log shows Vulkan renderer Turnip Adreno (TM) 740, Vulkan API 1.1. Crash occurs at InitializeOrResetSwapChain with 'Error getting system window info: Invalid window' / 'Unsupported windowing backend 0'. Gamescope child DISPLAY=:3 and SDL_DYNAMIC_API=/usr/lib/libSDL2-2.0.so.0 did not fix it. GL path rejects OpenGL core profile. Box64 cannot load Mesa/Vulkan stack cleanly.
