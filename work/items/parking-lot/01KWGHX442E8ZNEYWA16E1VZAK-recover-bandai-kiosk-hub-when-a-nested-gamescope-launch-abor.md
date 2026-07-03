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

## Acceptance Criteria

- [ ] A nested gamescope/Moonlight crash during launch does not leave the kiosk hub unrendered
- [ ] sessiond restore-to-idle succeeds or auto-restarts the hub renderer after a failed launch
- [ ] After a failed remote launch, app.server.status returns sessiond mode home/idle with renderer chromium running without manual intervention

## Related

- `product/services/device/sessiond.ts`
- `product/services/device/sessiond-sway.ts`
- `product/services/device/sessiond-source-machine.ts`
