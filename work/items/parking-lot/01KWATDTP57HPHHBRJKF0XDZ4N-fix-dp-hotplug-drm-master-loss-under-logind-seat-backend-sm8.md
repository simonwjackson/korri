---
id: 01KWATDTP57HPHHBRJKF0XDZ4N
slug: fix-dp-hotplug-drm-master-loss-under-logind-seat-backend-sm8
title: Fix DP-hotplug DRM-master loss under logind seat backend (SM8550)
origin: parked
status: To Do
priority: high
labels:
  - sm8550
  - compositor
  - logind
  - drm
  - display
created: 2026-06-29
source: user
---

# Fix DP-hotplug DRM-master loss under logind seat backend (SM8550)

## Why it matters

With seatBackend="logind" (committed aa0217b1), live DisplayPort hotplug black-screens all outputs: sway loses DRM master and every atomic commit returns EPERM ("Atomic commit failed: Permission denied", "Page-flip failed"). Recovery currently requires a compositor restart (which kills the session/UI). The external monitor works fine when present at compositor start; only live plug/unplug breaks it. This is the one remaining regression blocking logind from fully replacing the direct-mode workaround stack on a device that uses external monitors.

## Related

- `product/systems/nixos/modules/korri-rocknix-guest-device-access.nix`
- `product/systems/nixos/modules/korri-compositor.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`

## Notes

Mechanism: enableDrmSeatTag rule (korri-rocknix-guest-device-access.nix) tags the KMS card master-of-seat with NO action restriction, so a DP-hotplug 'change' uevent re-asserts master-of-seat and makes logind re-evaluate/pause the active session's DRM device. Cannot fix by restricting to ACTION=="add": the guest inherits card0 from the host and never sees an 'add'; it is tagged at boot via a change-action coldplug (rocknix-guest-coldplug: udevadm trigger --subsystem-match=drm --action=change). Candidate directions: (1) narrow the rule so re-firing on hotplug doesn't disturb logind (e.g. only set when not already tagged, or match initial coldplug differently), (2) handle libseat PauseDevice/ResumeDevice resume so wlroots re-acquires master after the connector change, (3) compositor-level auto-recovery on page-flip EPERM. Validation needs reproduce-with-hotplug cycles on bandai (deploy boot + guest reboot + physical DP plug/unplug). wlroots/sway 1.11. Repro: connected external works at compositor start; unplug+replug DP-1 while running -> black screens, recovered by `systemctl --user restart korri-compositor`.
