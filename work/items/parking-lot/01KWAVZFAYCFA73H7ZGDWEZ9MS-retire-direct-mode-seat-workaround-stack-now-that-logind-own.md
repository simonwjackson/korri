---
id: 01KWAVZFAYCFA73H7ZGDWEZ9MS
slug: retire-direct-mode-seat-workaround-stack-now-that-logind-own
title: Retire direct-mode seat workaround stack now that logind owns seat0 (SM8550)
origin: parked
status: To Do
priority: high
labels:
  - sm8550
  - logind
  - seat
  - cleanup
  - guest-device-access
created: 2026-06-29
source: user
---

# Retire direct-mode seat workaround stack now that logind owns seat0 (SM8550)

## Why it matters

The logind seat backend (committed aa0217b1) means the compositor now gets seat0, DRM, input, and uaccess device ACLs from systemd-logind. That makes the legacy ROCKNIX-guest workaround stack redundant: the manual setfacl input-ACL rule, the drmSeatRule master-of-seat tagging, the seat-device-trigger retrigger, and the polling korri-rocknix-device-acl-fallback service. Deleting them (after confirming logind fully covers device access + seat assignment) is what turns 'seat problem solved in principle' into 'solved holistically' and removes the 'running as root / manual ACL' friction for real. Leaving them in place is dead weight and can also re-introduce the kind of udev re-tagging implicated in the DP-hotplug DRM-master loss.

## Related

- `product/systems/nixos/modules/korri-rocknix-guest-device-access.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/systems/nixos/modules/korri-compositor.nix`

## Notes

Stack to evaluate for removal in korri-rocknix-guest-device-access.nix (enabled by rocknix-sm8550.nix): enableInputUdevAcl (setfacl on event* + uaccess), enableDrmSeatTag (master-of-seat on card*), retriggerSubsystems/seat-device-trigger oneshot, korri-rocknix-device-acl-fallback poller, enableBacklightRepair (verify separately). Method: disable incrementally behind the seatBackend=logind path, deploy Tier-1, reboot, confirm seat0 graphical + all device access still works (compositor DRM+input, korri-inputd evdev reads, audio, ttys). Likely supersedes/closes 01KVE1MNXRWQDF7571R470YN9Z (Harden SM8550 seat metadata when udev trigger cannot write sysfs) and may resolve 01KTSGMPVYKADEHWN4DE0QXR8Z (guest gid/ACL evdev retry-loop). Watch interaction with 01KWATDTP5 (DP-hotplug): the drmSeatRule removal may itself fix or change the hotplug behavior.
