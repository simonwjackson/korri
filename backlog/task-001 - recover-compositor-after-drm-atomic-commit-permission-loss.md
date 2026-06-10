---
id: task-001
title: Recover compositor after DRM atomic commit permission loss
status: To Do
priority: high
labels:
  - bandai
  - rocknix-sm8550
  - rootless-runtime
  - display
created: 2026-06-09
source: se-debug
---

# Recover compositor after DRM atomic commit permission loss

## Why it matters

Unplugging Ethernet reset the RockNIX USB controller and left Sway unable to page-flip both DSI outputs with `Atomic commit failed: Permission denied`; the device stayed black even though services and windows were active until the compositor was restarted manually.

## Acceptance Criteria

- [ ] Reproduce Ethernet unplug/USB reset without leaving the panels black.
- [ ] Detect sustained wlroots/Sway `Atomic commit failed: Permission denied` or `Page-flip failed` on DSI outputs.
- [ ] Recover automatically by restarting/reacquiring the compositor DRM/logind session without requiring SSH/manual intervention.
- [ ] After recovery, Korri desktop is visible and `korri-compositor`, `korri-sessiond`, `korrid`, and `korri-inputd` remain active.

## Related

- `product/systems/nixos/modules/korri-compositor.nix`
- `product/systems/nixos/modules/korri-sessiond.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`

## Notes

Live recovery: launched red/green foot windows on DSI-1/DSI-2; Sway reported visible but panels remained black. Logs showed old Sway PID repeatedly emitted `connector DSI-* Atomic commit failed: Permission denied` and `Page-flip failed`. Restarting `korri-compositor.service` created a new Sway PID and restored visible scanout; restarting `korri-sessiond.service` restored the normal Korri UI.
