---
id: 01KVE6M1MJX22HTG6VQCZ69YQZ
slug: source-control-sobo-retroarch-gl-video-driver-override
title: Source-control Sobo RetroArch GL video-driver override
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - sobo
  - retroarch
  - device-config
created: 2026-06-18
source: user
---

# Source-control Sobo RetroArch GL video-driver override

## Why it matters

Sobo renders RetroArch game frames correctly with `video: gl`; `glcore`, `vulkan`, and `sdl2` produced black/OSD-only screenshots during validation. Keeping this only in mutable `/var/lib/korri/config/local.korri.yaml` risks regression after config regeneration or device replacement.

## Acceptance Criteria

- [ ] A Sobo/device-profile config declares RetroArch `drivers.video: gl` or an equivalent platform-safe default.
- [ ] A launch screenshot for at least one RetroArch game is non-black after redeploy/restart.
- [ ] The reason for avoiding `glcore`/`vulkan`/`sdl2` on Sobo is documented near the config.

## Related

- `/var/lib/korri/config/local.korri.yaml`
- `product/plugins/retroarch/src/plugin.ts`
- `aaf513f4`

## Notes

Discovered while validating Super Mario World on Sobo. RetroArch OSD drew but core frames were black until using the GL video driver.
