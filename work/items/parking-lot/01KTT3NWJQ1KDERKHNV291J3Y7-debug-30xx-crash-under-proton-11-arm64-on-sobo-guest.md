---
id: 01KTT3NWJQ1KDERKHNV291J3Y7
slug: debug-30xx-crash-under-proton-11-arm64-on-sobo-guest
title: Debug 30XX crash under Proton 11 ARM64 on sobo guest
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - proton-arm64
  - sm8550
  - device
created: 2026-06-11
source: se-debug
---

# Debug 30XX crash under Proton 11 ARM64 on sobo guest

## Why it matters

First end-to-end Proton ARM64 game launch on the SM8550 guest gets through prefix creation and into the loading screen, then 30XX.exe dies (zombie) with no GPU fault or OOM. Knowing whether this is per-title or systemic (vkd3d/DXVK-on-Turnip, FEX arm64ec) determines how usable the Steam catalog is on this device.

## Acceptance Criteria

- [ ] Root cause of 30XX crash identified from Proton/wine logs
- [ ] At least one Windows title runs to gameplay under Proton 11 ARM64 on the guest
- [ ] Per-title vs systemic determination documented

## Notes

Repro: set CompatToolMapping for 1029210 to proton11_arm64 (tool appid 4628740, installs into 'Proton 11.0 (ARM64)' with bundled libarm64ecfex.dll — no FEX rootfs needed). Launch via steam://rungameid/1029210. Game reaches menu (resolution settable), crashes during level load; 30XX.exe goes zombie while wineserver/steam.exe persist, screen holds last frame. dmesg clean, memory fine. Next step: PROTON_LOG=1 run, read steamapps/compatdata/1029210 logs; also try a second, non-GameMaker title to split per-title vs systemic. Display geometry note: with both DSI panels enabled, games pick display 0 = DSI-1 1240x1080; workaround swaymsg 'output DSI-1 disable'; real fix is gamescope DRM session (gamescope not installed on guest yet).
