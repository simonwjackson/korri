---
id: 01KVEQ0Z9G09F36SSMXA1H4T1P
slug: expose-full-steam-launch-lifecycle-observability
title: Expose full Steam launch lifecycle observability
origin: parked
status: To Do
priority: high
labels:
  - steam
  - observability
  - ui
  - session-lifecycle
created: 2026-06-19
source: user
---

# Expose full Steam launch lifecycle observability

## Why it matters

Steam launches emit rich state across download, shader/preflight, install scripts, cloud sync, prompts, process creation, Proton/FEX, game window, crash/exit, and cleanup, but today most of it is only visible by tailing Steam logs or process lists. Surfacing it as structured events lets the UI react accurately, explain waits/failures, and maximize user-visible progress signaling.

## Acceptance Criteria

- [ ] Steam plugin emits structured lifecycle events for app update/download, shader/pre-cache, install scripts, cloud sync, user prompts/interstitials, CreatingProcess, process added/updated/removed, Proton/FEX runtime setup, game window/running, crash, normal exit, and cleanup
- [ ] Events include appId, playable id when known, phase, status, progress when available, raw source/log line, timestamp, severity, and actionable hints
- [ ] korrid/sessiond expose a read-only lifecycle stream or query API consumable by Portal and tooling
- [ ] Portal shows current launch/download/shader/Steam status instead of only accepted/failed
- [ ] Tests cover parsing representative Steam console/log lines observed during 30XX launch

## Related

- `product/plugins/steam`
- `product/services/device/sessiond.ts`
- `product/apps/portal`
- `packages/pi-korrid-tools`

## Notes

Observed 30XX signals included CheckShaderDepotManifest, ProcessingInstallScript, SynchronizingCloud, ShowInterstitials, CreatingProcess, WaitingGameWindow, Completed, Game process added/updated/removed, first-run setup, Proton/FEX processes, and screenshot-verified main menu.
