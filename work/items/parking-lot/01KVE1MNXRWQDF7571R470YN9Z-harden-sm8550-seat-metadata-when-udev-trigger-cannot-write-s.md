---
id: 01KVE1MNXRWQDF7571R470YN9Z
slug: harden-sm8550-seat-metadata-when-udev-trigger-cannot-write-s
title: Harden SM8550 seat metadata when udev trigger cannot write sysfs
origin: parked
status: To Do
priority: high
labels:
  - nixos
  - sm8550
  - device
  - follow-up
created: 2026-06-18
source: user
---

# Harden SM8550 seat metadata when udev trigger cannot write sysfs

## Why it matters

Sobo's post-deploy guest restart left korri-compositor failed because korri-rocknix-seat-device-trigger could not write DRM change events to read-only sysfs, so logind did not see /dev/dri/card0 as seat0. An ephemeral /run/udev/data entry let Sway start, but that workaround is not durable across reboot.

## Acceptance Criteria

- [ ] SM8550 guest boot/restart leaves /dev/dri/card0 tagged with seat/master-of-seat in the udev database without manual intervention.
- [ ] korri-compositor.service starts successfully after rocknix-guest.service restart.
- [ ] korri-rocknix-seat-device-trigger.service is active/exited or intentionally non-fatal with a covered fallback path.

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`

## Notes

Discovered during Sobo sync/deploy 2026-06-18. Manual live workaround wrote /run/udev/data/c226:0 with ID_SEAT=seat0 and tags seat/master-of-seat/uaccess, then restarted korri-compositor/sessiond.
