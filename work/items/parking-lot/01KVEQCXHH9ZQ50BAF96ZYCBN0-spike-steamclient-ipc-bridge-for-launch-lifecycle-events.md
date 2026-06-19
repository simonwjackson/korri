---
id: 01KVEQCXHH9ZQ50BAF96ZYCBN0
slug: spike-steamclient-ipc-bridge-for-launch-lifecycle-events
title: Spike SteamClient IPC bridge for launch lifecycle events
origin: parked
status: To Do
priority: high
labels:
  - steam
  - observability
  - ipc
  - portal
created: 2026-06-19
source: se-web-researcher
---

# Spike SteamClient IPC bridge for launch lifecycle events

## Why it matters

Decky/SteamOS prior art exposes richer, typed Steam lifecycle signals than log scraping, including LaunchAppTask_t, GameAction progress, EDisplayStatus, app lifetime notifications, focus changes, and update errors. If Korri can safely access these from Steam's CEF/SteamClient surface or a small companion, it becomes the highest-fidelity source for Portal launch status.

## Acceptance Criteria

- [ ] Determine whether bandai's Steam client exposes SteamClient.Apps/GameSessions hooks in a reachable CEF/webhelper context
- [ ] Prototype a read-only bridge that subscribes to GameAction task changes, app lifetime, focus changes, and display status without requiring UI interaction
- [ ] Compare IPC-derived events against existing tailed log events during a 30XX launch
- [ ] Document security/stability tradeoffs versus log/appmanifest scraping

## Related

- `product/plugins/steam/src/observability`
- `work/items/parking-lot/01KVEQ0Z9G09F36SSMXA1H4T1P-expose-full-steam-launch-lifecycle-observability.md`

## Notes

Prior art: decky-frontend-lib exposes LaunchAppTask_t/GameAction/EDisplayStatus/EAppUpdateError and SDH-PauseGames subscribes to RegisterForGameActionStart/TaskChange/AppLifetimeNotifications/FocusChangeEvents.
