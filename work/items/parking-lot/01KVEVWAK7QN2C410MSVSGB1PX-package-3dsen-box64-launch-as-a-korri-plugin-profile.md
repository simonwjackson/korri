---
id: 01KVEVWAK7QN2C410MSVSGB1PX
slug: package-3dsen-box64-launch-as-a-korri-plugin-profile
title: Package 3dSen Box64 launch as a Korri plugin/profile
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - 3dsen
  - box64
  - launch-profile
created: 2026-06-19
source: user
context:
  cwd: code/sandbox/korri
  branch: trunk
  commit: 18d0edc1
  repo: korri
---

# Package 3dSen Box64 launch as a Korri plugin/profile

## Why it matters

The manual 3dSen launch now works on bandai, but it depends on a device-local script, patched rom.json, and post-launch window placement. Packaging it as a first-party plugin or import profile will make it discoverable in Korri, reproducible across rebuilds, and less dependent on manual state.

## Acceptance Criteria

- [ ] Korri catalog includes a 3dSen / Super Mario Bros. 3D entry when the plugin/profile is enabled.
- [ ] Launch uses the validated Box64 + native Turnip safe profile with `-id=37` and generated rom.json mapping.
- [ ] Session lifecycle moves or contains the Xwayland window on DSI-2 without manual swaymsg.
- [ ] Smoke launch through Korri reaches a visible, playable SMB scene and returns cleanly to home on stop.

## Related

- `product/plugins`
- `device-local: var/lib/korri/content/games/3dsenpc/run-3dsenpc-box64-smb.sh`
- `device-local: home/korri/.config/unity3d/Geod Studio/3dSen/rom.json`

## Notes

Validated manual path: Box64 Linux 3dSen build, native ARM64 Mesa/Turnip, `BOX64_MAXCPU=1`, conservative dynarec flags, `./3dSen.exe -id=37`, DSI-2 window move. Screenshot filenames: `3dsen-smb-after-return.png`, `3dsen-smb-after-move.png`, `3dsen-durable-relaunch-dsi2.png`.
