---
id: 01KV9675S71YBG4MJ88C0VSP1X
slug: spike-joydev-plus-inputplumber-old-sdl-controller-compatibil
title: Spike joydev plus InputPlumber old-SDL controller compatibility
origin: parked
status: To Do
priority: medium
labels:
  - bandai
  - input
  - inputplumber
  - joydev
  - plugins
  - neverball
created: 2026-06-16
source: user
---

# Spike joydev plus InputPlumber old-SDL controller compatibility

## Why it matters

Neverball proved older native/SDL joystick consumers may miss or select the wrong controller on Bandai. Current image lacks CONFIG_INPUT_JOYDEV and SDL enumeration sees the raw Xbox Series controller rather than the InputPlumber virtual Xbox 360 pad, so enabling joydev without raw-device filtering could create duplicate P1/P2 controller confusion across older games.

## Acceptance Criteria

- [ ] Build or otherwise test a Bandai image/kernel with CONFIG_INPUT_JOYDEV enabled.
- [ ] Record /dev/input/js* nodes and map each js/event device to raw vs InputPlumber virtual devices.
- [ ] Run sdl-jstest/sdl2-jstest as the korri user before and after joydev and document device ordering.
- [ ] Launch Neverball or an equivalent old SDL joystick consumer and verify whether it binds raw, virtual, or duplicate devices.
- [ ] Recommend a product path: InputPlumber raw-device inhibition, permission filtering, per-launch SDL selection, or a plugin-specific input shim.

## Related

- `product/systems/nixos/modules/korri-input.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/plugins/neverball/index.ts`

## Notes

Observed on Bandai: /dev/input/event10 is Microsoft Xbox Series S|X Controller, /dev/input/event12 is InputPlumber virtual Microsoft X-Box 360 pad 0, no /dev/input/js*, and /proc/config.gz reports '# CONFIG_INPUT_JOYDEV is not set'. Running sdl-jstest --list as korri found one joystick: Xbox Series X Controller.
