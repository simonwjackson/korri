---
id: 01KWFRBABT3ETSRZTMRCD04H3N
slug: pin-korri-hub-window-to-hub-workspace-in-lane-policy
title: Pin Korri hub window to hub workspace in lane policy
origin: parked
status: To Do
priority: high
labels:
  - korri
  - bandai
  - workspace-lanes
  - bug
created: 2026-07-01
source: se-debug
---

# Pin Korri hub window to hub workspace in lane policy

## Why it matters

The lane-aware kiosk policy can launch or repair the Chromium hub while another workspace is focused, leaving `korri:hub` empty and causing Home to focus a black workspace instead of the GUI. This breaks the core Home/Game lane mental model on device.

## Acceptance Criteria

- [ ] Lane-aware `enterIdle`/reconcile ensures Chromium/Korri hub windows are on `KORRI_SESSIOND_HUB_WORKSPACE` before advertising Home ready.
- [ ] Existing game windows remain on `KORRI_SESSIOND_GAME_WORKSPACE` and are not co-located with the hub after launch or sessiond restart/recovery.
- [ ] A regression test covers launching/reconciling hub while `korri:game:active` is focused.

## Related

- `product/services/device/sessiond-role.ts`
- `product/services/device/sessiond-sway.ts`
- `product/services/device/sessiond-lanes.ts`
