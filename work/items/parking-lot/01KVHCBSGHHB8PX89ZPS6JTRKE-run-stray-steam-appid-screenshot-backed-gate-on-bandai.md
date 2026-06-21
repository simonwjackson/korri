---
id: 01KVHCBSGHHB8PX89ZPS6JTRKE
slug: run-stray-steam-appid-screenshot-backed-gate-on-bandai
title: Run Stray Steam AppID screenshot-backed gate on Bandai
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - matrix
  - bandai
  - stray
  - deferred
created: 2026-06-20
source: user
---

# Run Stray Steam AppID screenshot-backed gate on Bandai

## Why it matters

Stray is the remaining untested local Steam candidate and dry-runs through the desired `korri-steam-app 1332010` envelope, but it is heavier/likely higher-risk than the current 2D proof set. Deferring keeps the matrix focused while preserving Stray as the next high-stress Steam-owned launch proof.

## Acceptance Criteria

- [ ] Dry-run for `stray` resolves to `/run/current-system/sw/bin/korri-steam-app ["1332010"]`.
- [ ] Launch through Korrid reaches a live Steam-owned AppID process tree for at least 60 seconds.
- [ ] A fresh DSI-2 screenshot is captured, pulled locally, visually inspected, and confirmed non-black.
- [ ] Stop returns the session to `home` with no residual `SteamLaunch AppId=1332010`, Stray, Proton, or wrapper tree attributable to the launch.

## Related

- `/var/lib/korri/config/local.korri.yaml`
- `/tmp/korri-proof`
- `out/steam-up.md`

## Notes

User explicitly asked to defer Stray. Preflight already checked: Korrid id `stray`, AppID `1332010`, dry-run resolved to `/run/current-system/sw/bin/korri-steam-app ["1332010"]`, readiness `SessionReady` / `home`.
