---
id: 01KV4HDP6RXMJYSYQY1DFHTW5W
slug: verify-steam-wrapper-termination-before-session-stop-reports
title: Verify Steam wrapper termination before session stop reports Stopped
origin: parked
status: To Do
priority: high
labels:
  - steam
  - sessiond
  - lifecycle
created: 2026-06-15
source: steam-observability-smoke
---

# Verify Steam wrapper termination before session stop reports Stopped

## Why it matters

During Bandai Steam observability smoke, app.session.stop returned Stopped while Sonic Mania's Gamescope/SteamLaunch process tree was still alive. This can leave Steam status Running and forces manual wrapper cleanup, undermining foreground lifecycle truth.

## Acceptance Criteria

- [ ] Stopping a sessiond-managed Steam launch terminates the Gamescope/SteamLaunch root or reports a non-terminal stop state/failure.
- [ ] app.steam.status transitions from Running to Stopped after app.session.stop without manual process kill.
- [ ] Regression covers a Steam-like managed launch whose process survives the first stop signal.

## Related

- `product/services/device/sessiond.ts`
- `product/services/device/inputd-actions.ts`
- `work/items/parking-lot/01KV3A5RNCMMGR8FY5Y8MKPWGD-normalize-all-foreground-launches-under-one-lifecycle-superv.md`
- `work/items/active/01KV3KWT98Y6W6CNXP05ZPSHH7-capture-steam-launch-diagnostics-as-first-class-session-arti/work.md`
