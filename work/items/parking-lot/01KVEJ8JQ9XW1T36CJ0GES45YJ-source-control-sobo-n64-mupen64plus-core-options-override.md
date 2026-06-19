---
id: 01KVEJ8JQ9XW1T36CJ0GES45YJ
slug: source-control-sobo-n64-mupen64plus-core-options-override
title: Source-control Sobo N64 Mupen64Plus core-options override
origin: parked
status: To Do
priority: medium
labels:
  - device:sobo
  - retroarch
  - n64
  - durability
created: 2026-06-18
source: user
---

# Source-control Sobo N64 Mupen64Plus core-options override

## Why it matters

Super Mario 64 runs on Sobo only after adding mutable RetroArch core options that switch Mupen64Plus-Next from the default/GL renderer path to Angrylion/CXD4; without making that device policy durable, a config reset can regress N64 to a black screen while the emulator process keeps running.

## Acceptance Criteria

- [ ] Sobo/device profile provisions a RetroArch core options path or equivalent generated core-options artifact for N64 launches.
- [ ] Mupen64Plus-Next launches on Sobo with visible Super Mario 64 frames after reboot/redeploy without manual edits under /storage/.config/retroarch.
- [ ] The policy documents why Angrylion/CXD4 is used on Sobo and notes its CPU cost.

## Related

- `/var/lib/korri/config/local.korri.yaml`
- `/storage/.config/retroarch/core-options.cfg`
- `product/plugins/retroarch/src/plugin.ts`
- `product/plugins/retroarch/nix/nixos-module.nix`

## Notes

GLideN64/Rice/default path produced black unchanged screenshots; Angrylion/CXD4 produced visible Super Mario 64 gameplay but ~246% CPU.
