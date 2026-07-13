---
id: 01KXC60FV1PABX2JAZCBFNTTY8
slug: add-d-pad-action-button-navigation-for-korri-ui-and-osk
title: Add D-pad/action-button navigation for Korri UI and OSK
origin: parked
status: To Do
priority: medium
labels:
  - follow-up
  - input
  - ui
  - bandai
created: 2026-07-12
source: user
---

# Add D-pad/action-button navigation for Korri UI and OSK

## Why it matters

Bandai is a handheld with an unreliable Android Back button; users want to drive the kiosk UI and on-screen keyboard with the D-pad and face buttons instead of touch. wvkbd is touch-first and has no controller focus model, so this needs a real gamepad navigation layer (roving/spatial focus, A=confirm, B=back, D-pad=move) and likely a controller-navigable keyboard surface rather than wvkbd.

## Acceptance Criteria

- [ ] D-pad moves focus and A/B confirm/cancel across the Korri portal UI without touch.
- [ ] A controller-navigable on-screen keyboard path exists (either a custom OSK surface or an input bridge that drives key selection), not relying on wvkbd touch-only interaction.
- [ ] Gamepad navigation does not leak into foreground game/stream sessions (scoped to hub/portal focus only).
- [ ] Covered by tests for focus movement and confirm/cancel routing.

## Related

- `product/services/device/inputd.ts`
- `product/services/device/inputd-actions.ts`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
