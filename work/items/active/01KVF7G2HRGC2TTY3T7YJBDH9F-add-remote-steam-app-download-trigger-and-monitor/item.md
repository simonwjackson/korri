---
id: 01KVF7G2HRGC2TTY3T7YJBDH9F
slug: add-remote-steam-app-download-trigger-and-monitor
title: Add remote Steam app download trigger and monitor
origin: parked
status: Done
priority: high
labels:
  - steam
  - download
  - observability
  - portal
created: 2026-06-19
source: user
---

# Add remote Steam app download trigger and monitor

## Why it matters

Operators should be able to install/update Steam games from Korri UI/API without touching the Steam UI, while keeping Steam credentials and private protocols out of korrid by default.

## Acceptance Criteria

- [x] Korrid exposes a typed provider API to request a Steam app install/update for an owned AppID through the logged-in local Steam client.
- [x] The API reports honest states such as requested, queued, downloading, installed, failed, and unknown from Steam manifests/logs without requiring Steam UI interaction.
- [x] Portal can trigger and monitor the download remotely using the typed API/status path.
- [x] Implementation avoids storing Steam credentials and documents/guards any experimental Steam console/private-protocol fallback.

## Related

- `product/plugins/steam`
- `product/apps/portal/api`
- `work/items/parking-lot/01KVF07E2Z5N87FRPYFC1Q4JMJ-fix-deployed-steam-lifecycle-launchid-correlation-for-30xx.md`

## Notes

Research found and implementation used the proven logged-in local Steam client helper path `korri-steam-guest -console +app_install <appid>` plus filesystem/log observation (`libraryfolders.vdf`, `appmanifest_*.acf`, `content_log.txt`); avoid SteamCMD for consumer games and avoid SteamKit/DepotDownloader/private IPC unless explicitly gated/legal-reviewed.
