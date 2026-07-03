---
id: task-002
title: Prevent USB hotplug from perturbing DSI scanout
status: To Do
priority: high
labels:
  - bandai
  - rocknix-sm8550
  - usb-hotplug
  - display
  - rootless-runtime
created: 2026-06-09
source: se-debug
---

# Prevent USB hotplug from perturbing DSI scanout

## Why it matters

The appliance display must remain stable while users plug or unplug Ethernet/USB accessories. A compositor restart can recover from the current black screen, but it is visibly disruptive and does not meet the product bar.

## Acceptance Criteria

- [ ] Plugging or unplugging the USB Ethernet adapter has no visible effect on either DSI panel: no black frame, no flicker, no workspace movement, no compositor restart.
- [ ] During repeated USB hotplug cycles, Sway/wlroots continues using the same compositor process and does not log `Atomic commit failed` or `Page-flip failed` for DSI outputs.
- [ ] DRM/logind seat state for `/dev/dri/card0` remains stable across USB device remove/add events.
- [ ] Any host/guest udev changes remain narrowly scoped to USB/input/network devices and do not retrigger or revoke DRM/display access.

## Related

- `../nix-on-rocks/patches/rocknix/0018-substrate-coldplug-guest-uevents.patch`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/systems/nixos/modules/korri-compositor.nix`

## Notes

This is stricter than automatic recovery. User explicitly rejected visible compositor restart/flicker as an acceptable fix. Current boot coldplug fix is not expected to solve runtime USB hotplug display perturbation by itself.
