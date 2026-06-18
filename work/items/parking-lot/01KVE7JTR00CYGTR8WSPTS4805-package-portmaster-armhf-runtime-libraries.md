---
id: 01KVE7JTR00CYGTR8WSPTS4805
slug: package-portmaster-armhf-runtime-libraries
title: Package PortMaster armhf runtime libraries
origin: parked
status: To Do
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

- [ ] A plugin-owned resource provides the minimal armhf runtime libraries needed by direct SDL/SDL2 armhf PortMaster ports.
- [ ] `portmaster.install` or `portmaster.prepare-launch` can add those libraries to the armhf qemu wrapper/library path without editing upstream scripts.
- [ ] A real armhf PortMaster game such as SkiFree, Apotris, or another small direct armhf title renders on Bandai through qemu-arm.

## Related

- `product/plugins/portmaster/src/installer.ts`
- `product/plugins/portmaster/src/envelope.ts`
- `work/items/parking-lot/01KVDXP0A4DKSQY78KYY84XEAP-portmaster-plugin-compatibility-substrate-brief.md`
