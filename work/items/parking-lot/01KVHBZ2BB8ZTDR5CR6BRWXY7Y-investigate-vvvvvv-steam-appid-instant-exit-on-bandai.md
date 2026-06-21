---
id: 01KVHBZ2BB8ZTDR5CR6BRWXY7Y
slug: investigate-vvvvvv-steam-appid-instant-exit-on-bandai
title: Investigate VVVVVV Steam AppID instant exit on Bandai
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - matrix
  - bandai
  - vvvvvv
created: 2026-06-20
source: se-work
---

# Investigate VVVVVV Steam AppID instant exit on Bandai

## Why it matters

VVVVVV resolves and launches through the correct Steam-owned `korri-steam-app 70300` path, but exits before the 60s liveness/screenshot gate. Without understanding whether this is expected native-runtime behavior, a missing dependency, display/input issue, or Steam Runtime mismatch, the Steam matrix has an unresolved false-negative/compatibility gap.

## Acceptance Criteria

- [ ] Launching `vvvvvv` through Korrid keeps the foreground process alive for at least 60 seconds or produces a documented, intentional unsupported classification.
- [ ] A fresh local screenshot is captured and visually inspected if the launch is fixed.
- [ ] Failure logs identify the root cause if it remains unsupported.
- [ ] Stop/cleanup leaves no residual `SteamLaunch AppId=70300` or VVVVVV process tree.

## Related

- `/var/lib/korri/config/local.korri.yaml`
- `product/plugins/steam/src/materializer.ts`
- `/tmp/korri-proof`

## Notes

Observed on Bandai: dry-run resolves to `/run/current-system/sw/bin/korri-steam-app ["70300"]`; Steam logs show AppID 70300, SteamLinuxRuntime_sniper, `/var/lib/korri/steam/steamapps/common/VVVVVV/VVVVVV`, then VVVVVV logs base/save/lang dirs and Steam removes all AppID 70300 processes ~14s after start. No screenshot proof because process exited before capture gate.
