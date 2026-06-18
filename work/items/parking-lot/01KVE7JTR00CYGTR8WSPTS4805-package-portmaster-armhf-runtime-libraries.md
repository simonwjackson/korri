---
id: 01KVE7JTR00CYGTR8WSPTS4805
slug: package-portmaster-armhf-runtime-libraries
title: Package PortMaster armhf runtime libraries
origin: parked
status: Done
priority: high
labels:
  - plugins
  - portmaster
  - armhf
  - runtime
  - bandai
created: 2026-06-18
source: se-work
---

# Package PortMaster armhf runtime libraries

## Why it matters

The Phase 8 qemu-arm lane can execute armhf binaries, but real ready-to-run armhf games such as SkiFree still fail on Bandai because PortMaster archives assume base armhf runtime libraries like libSDL2 are already present.

## Acceptance Criteria

- [x] A plugin-owned resource provides the minimal armhf runtime libraries needed by direct SDL/SDL2 armhf PortMaster ports.
- [x] `portmaster.install` or `portmaster.prepare-launch` can add those libraries to the armhf qemu wrapper/library path without editing upstream scripts.
- [x] A real armhf PortMaster game such as SkiFree, Apotris, or another small direct armhf title renders on Bandai through qemu-arm.

## Result

Added `.#portmaster-armhf-runtime`, with `nix-support/armhf-rootfs`, `nix-support/library-path`, `nix-support/qemu-arm`, and `nix-support/env`. Built the aarch64 package via Fuji, copied it to Bandai, and rendered SkiFree from `skifree.zip` via generated armhf qemu wrapper. Screenshot: `/tmp/portmaster-phase8-skifree5-screen-focused.png`.

## Related

- `product/plugins/portmaster/src/installer.ts`
- `product/plugins/portmaster/src/envelope.ts`
- `work/items/parking-lot/01KVDXP0A4DKSQY78KYY84XEAP-portmaster-plugin-compatibility-substrate-brief.md`
