---
id: 01KVEVWAK7QN2C410MSVSGB1PX
slug: package-3dsen-box64-launch-as-a-korri-plugin-profile
title: Productize 3dSen with Box64 and Turnip plugins
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

# Productize 3dSen with Box64 and Turnip plugins

## Why it matters

The manual 3dSen launch now works on bandai, but it depends on a device-local script and patched rom.json. Packaging the path as reusable Box64 and Turnip plugin infrastructure plus an app-like 3dSen integration will make configured releases launch reproducibly without manual state.

## Acceptance Criteria

- [ ] Configured releases can select the 3dSen app/profile and provide profile-to-ROM mappings, with multiple profiles supported from day one.
- [ ] Launch uses the validated Box64 + native Turnip safe profile with profile-id argv and generated rom.json mapping.
- [ ] `@korri:box64-runtime` and `@korri:turnip` are reusable plugin capabilities, not 3dSen-only script internals.
- [ ] Smoke launch through Korri reaches a visible, playable SMB/profile `37` scene and returns cleanly to home on stop.
- [ ] Deferred: DSI/window placement is tracked separately and is not required for this item.

## Related

- `product/plugins`
- `device-local: var/lib/korri/content/games/3dsenpc/run-3dsenpc-box64-smb.sh`
- `device-local: home/korri/.config/unity3d/Geod Studio/3dSen/rom.json`

## Notes

Validated manual path: Box64 Linux 3dSen build, native ARM64 Mesa/Turnip, `BOX64_MAXCPU=1`, conservative dynarec flags, `./3dSen.exe -id=37`. DSI/window placement is intentionally deferred from this item. Screenshot filenames: `3dsen-smb-after-return.png`, `3dsen-smb-after-move.png`, `3dsen-durable-relaunch-dsi2.png`.
