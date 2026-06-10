---
id: 01KTSGMPVYKADEHWN4DE0QXR8Z
slug: fix-guest-gid-mapping-acls-for-bare-evdev-nodes-so-inputd-st
title: Fix guest gid mapping/ACLs for bare evdev nodes so inputd stops retry-looping
origin: parked
status: To Do
priority: medium
labels:
  - rocknix-sm8550
  - input
created: 2026-06-10
source: se-debug
context:
  branch: trunk
  repo: korri
  invoked_by: bandai sleep-health investigation 2026-06-10
---

# Fix guest gid mapping/ACLs for bare evdev nodes so inputd stops retry-looping

## Why it matters

Host-bound /dev/input nodes carry host gid 104 which has no guest mapping, so korri-inputd fails to open event0/1/2/4/5/6 and logs an error retry loop every few seconds forever (wasted CPU, noisy logs, and silent loss of power/lid/volume/touch events). The prototype proved setfacl u:korri:rw fixes it; the durable fix belongs in the seat udev/ACL trigger.

## Acceptance Criteria

- [ ] korri-inputd opens all discovered bare nodes without EACCES after boot
- [ ] No event-stream retry-loop warnings in steady-state logs
