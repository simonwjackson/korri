---
id: 01M1FAJABCE7XNZM79PAB4KKNX
title: Restore Korri-owned headless Sway compositor on Zao
status: active
created: 2026-09-01
source: parking-lot
---

# Restore Korri-owned headless Sway compositor on Zao

Replace Zao's software Xvfb display with one Korri-owned headless Sway session. Sunshine captures the compositor output. Inputd sends bounded focus and fullscreen commands for one active game. The client portal remains the only hub.

## Current status

- U1 passed on Zao without a host configuration change.
- Vulkan used `/dev/dri/renderD129`, the NVIDIA RTX 3060 render node.
- Sway created `HEADLESS-1` at 1920x1080 and 60 Hz on `wayland-1`.
- Two captures differed by 55,794 pixels.
- NVENC encoded H.264 at 1920x1080 and 60 FPS.
- A game-like unit kept Wayland access with the control directory hidden.
- The same unit could not use Sway IPC.
- The selected boundary uses one session identity and `InaccessiblePaths` on every game unit.
- Cleanup left no Sway process, Wayland socket, or test unit.
- The Sunshine private-state digest stayed `f8979ccb7cee28a943cb3d0361da5af1ff80044c72140e88cd94594e85a750bd`.
- The current and default generations stayed `/nix/store/1mcr6ss9qailqcmnfrfw8vv8b0rmxsr5-nixos-system-zao-26.05.20260313.c06b4ae`.
- This item graduated from `work/items/parking-lot/`. The original text is in `item.md`.

## Execution tracker

- [x] U1: Headless capture and boundary spike
- [ ] U2: Compositor session in the Linux host module
- [ ] U3: Game environment and moving gate on Wayland
- [ ] U4: Inputd compositor control action
- [ ] U5: Zao candidate rollout and persistent switch
