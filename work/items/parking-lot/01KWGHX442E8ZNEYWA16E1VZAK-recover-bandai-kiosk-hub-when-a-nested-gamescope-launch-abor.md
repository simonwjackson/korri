---
id: 01KWGHX442E8ZNEYWA16E1VZAK
slug: recover-bandai-kiosk-hub-when-a-nested-gamescope-launch-abor
title: Recover Bandai kiosk hub when a nested gamescope launch aborts
origin: parked
status: In Progress
priority: high
labels:
  - korri
  - sessiond
  - kiosk
  - reliability
  - moonlight
created: 2026-07-02
source: se-debug
---

# Recover Bandai kiosk hub when a nested gamescope launch aborts

## Why it matters

A crashed nested gamescope (SIGABRT, 'IWaitable hung up. Aborting.') during a remote-source launch takes down the Bandai kiosk session. sessiond then fails to restore idle (repeated 'Unable to connect to /run/user/2000/sway-ipc.sock'), leaves mode=stopped with no Chromium renderer, and the device is left on a black screen with no GUI and no self-recovery. This is a higher-severity reliability failure than the stream itself: a single bad launch bricks the appliance UI until a manual korri-sessiond restart.

## Locus pinned 2026-07-05

The kiosk role's `restoreIdleAfterLaunch` (product/services/device/sessiond-role.ts:388)
is: `noteLaunchTimeout("managed-launch") -> laneController.focusHub() -> reconcile()`.
All three depend on a live sway (deps.sway / SWAYSOCK) and none verify that sway or the
Chromium renderer survived the launch. When the nested gamescope SIGABRT takes sway down,
`focusHub`/`reconcile` throw ("Unable to connect to sway-ipc.sock"), restore fails, and the
hub is never re-rendered. Fix direction: make restore resilient — detect an unreachable
sway or dead renderer and re-establish the idle target (relaunch renderer / restart the
compositor via the service manager) instead of throwing. `enterIdle` already contains the
renderer-relaunch primitive (`deps.renderer.launch()` when `rendererPid === undefined`);
restore should fall back to that path on a sway/renderer-death signal. Unit-testable
without reproducing the crash (inject a throwing sway + assert renderer relaunch).

## Acceptance Criteria

- [ ] A nested gamescope/Moonlight crash during launch does not leave the kiosk hub unrendered
- [ ] sessiond restore-to-idle succeeds or auto-restarts the hub renderer after a failed launch
- [ ] After a failed remote launch, app.server.status returns sessiond mode home/idle with renderer chromium running without manual intervention

## Related

- `product/services/device/sessiond.ts`
- `product/services/device/sessiond-sway.ts`
- `product/services/device/sessiond-source-machine.ts`
