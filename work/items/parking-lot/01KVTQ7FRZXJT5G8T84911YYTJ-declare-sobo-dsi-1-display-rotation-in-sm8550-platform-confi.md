---
id: 01KVTQ7FRZXJT5G8T84911YYTJ
slug: declare-sobo-dsi-1-display-rotation-in-sm8550-platform-confi
title: Declare Sobo DSI-1 display rotation in SM8550 platform config
origin: parked
status: To Do
priority: high
labels:
  - sobo
  - sm8550
  - display
  - deployment
created: 2026-06-23
source: user
---

# Declare Sobo DSI-1 display rotation in SM8550 platform config

## Why it matters

Manual Sway rotation fixes are lost on redeploy; the last switch reset Sobo to the wrong orientation until `swaymsg output DSI-1 transform 270` was applied live.

## Acceptance Criteria

- [ ] Sobo/SM8550 kiosk Sway config sets DSI-1 transform 270 declaratively.
- [ ] A rebuild/switch preserves right-side-up orientation without manual swaymsg.
- [ ] Config/check coverage asserts the expected display transform for the Sobo target.

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`

## Notes

Live fix applied: `swaymsg output DSI-1 transform 270`. Avoid further deploys until this is included or consciously accepted.
