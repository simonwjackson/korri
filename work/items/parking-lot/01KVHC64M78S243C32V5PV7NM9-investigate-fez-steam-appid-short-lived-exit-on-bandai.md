---
id: 01KVHC64M78S243C32V5PV7NM9
slug: investigate-fez-steam-appid-short-lived-exit-on-bandai
title: Investigate FEZ Steam AppID short-lived exit on Bandai
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - matrix
  - bandai
  - fez
  - proton
  - fex
created: 2026-06-20
source: se-work
---

# Investigate FEZ Steam AppID short-lived exit on Bandai

## Why it matters

FEZ proves the correct Steam-owned `korri-steam-app 224760` envelope reaches SteamLinuxRuntime_sniper, Proton 10.0, FEX, and `FEZ.exe`, but it exits before the 60s liveness/screenshot gate. This leaves a compatibility gap distinct from the product launch-path proof.

## Acceptance Criteria

- [ ] Launching `fez` through Korrid keeps `FEZ.exe` alive for at least 60 seconds or the game is documented as unsupported with root-cause logs.
- [ ] A fresh DSI-2 screenshot is captured, pulled locally, and visually inspected if the launch is fixed.
- [ ] Failure logs identify the root cause if it remains unsupported.
- [ ] Stop/cleanup leaves no residual `SteamLaunch AppId=224760`, `FEZ.exe`, or `korri-steam-app 224760` tree.

## Related

- `/var/lib/korri/config/local.korri.yaml`
- `product/plugins/steam/src/materializer.ts`
- `docs/solutions/runtime-errors/steam-sniper-fex-bwrap-architecture-path-2026-06-19.md`

## Notes

Observed on Bandai: dry-run resolves to `/run/current-system/sw/bin/korri-steam-app ["224760"]`; Steam logs show AppID 224760, SteamLinuxRuntime_sniper, Proton 10.0, FEX, and `/var/lib/korri/steam/steamapps/common/FEZ/FEZ.exe`. Steam removed all AppID 224760 processes around 22:00:35, roughly 21s after process add, before screenshot gate. Session returned home and residual scan was clean.
