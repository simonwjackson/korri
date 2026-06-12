---
id: 01KTWCPZQMNMVY3SEMSZCWYET4
slug: decide-fate-of-live-uevent-rw-test-drop-in-on-bandai-promote
title: Decide fate of live-uevent-rw-test drop-in on bandai (promote or delete)
origin: parked
status: To Do
priority: medium
labels:
  - nix-on-rocks
  - substrate
  - udev
  - drift
created: 2026-06-11
source: se-debug
context:
  repo: nix-on-rocks
  invoked_by: bandai debugging 2026-06-11
---

# Decide fate of live-uevent-rw-test drop-in on bandai (promote or delete)

## Why it matters

bandai's ROCKNIX host carries /storage/.config/system.d/rocknix-guest.service.d/90-live-uevent-rw-test.conf, which swaps ExecStart to /storage/.cache/rocknix-guest-start-uevent-rw-test — a hacked copy of rocknix-guest-start that bind-mounts writable /sys/**/uevent files into the guest. It predates today's sessions, is invisible to the packaged substrate, and may be load-bearing for guest udev/coldplug (SD-card hotplug events feed korri-removable-media). Leaving an unowned fork of the start script on one device is drift: the next substrate image update silently diverges from what actually runs. Either promote the uevent binds into the real rocknix-guest-start in rocknix-guest-substrate (with a static check) or prove guest coldplug works without them and delete the drop-in + cached script.

## Acceptance Criteria

- [ ] Decision recorded: uevent binds promoted into rocknix-guest-start, or proven unnecessary
- [ ] If promoted: change lands in rocknix-guest-substrate with the start-script static checks passing
- [ ] If deleted: SD-card insert/remove hotplug (korri-removable-media udev rules) validated on bandai without the drop-in
- [ ] /storage/.cache/rocknix-guest-start-uevent-rw-test and the 90-live-uevent-rw-test.conf drop-in removed from the device once superseded

## Related

- `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/scripts/rocknix-guest-start`
- `device: /storage/.config/system.d/rocknix-guest.service.d/90-live-uevent-rw-test.conf`
