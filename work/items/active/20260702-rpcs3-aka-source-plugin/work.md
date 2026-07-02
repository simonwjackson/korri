---
title: Build RPCS3 source-machine plugin for Aka
type: feat
status: active
date: 2026-07-02
---

# Build RPCS3 source-machine plugin for Aka

Plan and implement a Korri first-party RPCS3 plugin and Aka host wiring so PS3 titles in the Towada gaming library can be discovered, advertised by Aka, and launched through Korri's source-machine streaming path.

## Progress

- Added the first-party `@korri:rpcs3` plugin with PS3 disc-folder discovery for direct child `PS3_DISC.SFB` markers.
- Added RPCS3 readable launch materialization with absolute command, readable game/state roots, and firmware sentinel checks before spawn.
- Added opt-in NixOS source-machine wiring via `services.korri.rpcs3` and exposed it through `korri-source-machine`.
- Validated the real Towada library shape: `Skate 3 [BLUS30464]/PS3_DISC.SFB` is present as a direct marker.

## Live validation blocker

Aka does not currently have the default RPCS3 firmware sentinel at `/home/simonwjackson/.config/rpcs3/dev_flash/sys/external/liblv2.sprx` or `/var/lib/korri/rpcs3/dev_flash/sys/external/liblv2.sprx`. Live launch/stream validation remains blocked until firmware is installed manually into the state root; this work intentionally does not install or bundle PS3 firmware.
