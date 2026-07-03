---
id: 01KWHTRZCF52AXHASY06M2SA66
slug: fix-boot-time-sessiond-lane-event-source-unavailable-sway-so
title: "Fix boot-time sessiond 'lane event source unavailable' (Sway socket not discovered at startup)"
origin: parked
status: To Do
priority: high
labels:
  - korri
  - sessiond
  - boot-ordering
  - sway
  - streaming
  - reliability
created: 2026-07-02
source: se-debug
---

# Fix boot-time sessiond 'lane event source unavailable' (Sway socket not discovered at startup)

## Why it matters

After a Bandai reboot, korri-sessiond started before it could discover the korri-compositor Sway IPC socket, logging 'sessiond lane-aware kiosk policy could not discover Sway socket'. It never recovered: every managed launch then failed at beforeChildLaunch with 'lane event source unavailable'. The user-visible symptom is that remote-stream launches return Accepted/launched (korrid dispatches and the aka peer prepares) but no Moonlight child ever spawns and nothing streams. The manual workaround is `systemctl --user restart korri-sessiond` once Sway is up, which re-discovers the lane and restores launches. This is a distinct trigger from 01KWGHX442 (post nested-gamescope-crash restore): here it is a cold-boot ordering race between korri-sessiond and korri-compositor. Recurs on every reboot until fixed.

## Acceptance Criteria

- [ ] korri-sessiond waits for / retries discovery of the korri-compositor Sway socket at startup instead of wedging its lane event source
- [ ] After a cold boot, remote-stream launches spawn the Moonlight child without a manual sessiond restart
- [ ] 'lane event source unavailable' no longer terminates managed launches when Sway is actually up

## Related

- `product/services/device/sessiond-sway.ts`
- `product/services/device/sessiond.ts`
- `product/systems/nixos/modules/korri-sessiond.nix`
- `01KWGHX442E8ZNEYWA16E1VZAK`
- `01KVEN8873H1E47BHXV0SBD7DC`
