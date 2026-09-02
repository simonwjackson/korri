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
- U1 first proved that a game-like unit kept Wayland access while Sway IPC stayed hidden.
- Security review found that native Wayland management protocols still give a game compositor authority.
- The production boundary keeps games on Xwayland `:0` and does not give them native Wayland access.
- Each game unit hides `/run/korri-compositor` and `/run/user/UID`.
- Each game unit receives a read-only bind for Xwayland socket `X0` only.
- Each game unit uses a private PID namespace, so same-UID procfs paths cannot reach Sway IPC.
- Sunshine uses Wayland capture and a private PID namespace. Sunshine cannot reach Sway IPC through procfs.
- Cleanup after U1 left no Sway process, Wayland socket, or test unit.
- The Sunshine private-state digest stayed `f8979ccb7cee28a943cb3d0361da5af1ff80044c72140e88cd94594e85a750bd`.
- The current and default generations stayed `/nix/store/1mcr6ss9qailqcmnfrfw8vv8b0rmxsr5-nixos-system-zao-26.05.20260313.c06b4ae`.
- U2 replaced `x11-headless.service` with `korri-compositor.service` in the Linux host module.
- The compositor publishes `/run/korri-compositor/sway-ipc.sock` and `/run/user/UID/korri-wayland`.
- Sunshine starts after the compositor and uses the stable Wayland display for capture.
- U3 gives games `DISPLAY=:0` and `XDG_SESSION_TYPE=x11` only.
- The production moving gate uses `--gpu-context=x11egl` inside Sway's Xwayland server.
- U4 maps the inputd action to immutable `swaymsg` arguments without a shell.
- The action focuses and enables fullscreen on workspace `korri:game:active`.
- The host module check, Korrid module check, full Korrid suite, deployment matrix, ShellCheck, and bitmap test passed.
- Commits `00c40fba` and `f7735a77` contain the final isolation and deployment gates.
- This item graduated from `work/items/parking-lot/`. The original text is in `item.md`.

## Execution tracker

- [x] U1: Headless capture and boundary spike
- [x] U2: Compositor session in the Linux host module
- [x] U3: Game environment and moving gate on Xwayland
- [x] U4: Inputd compositor control action
- [ ] U5: Zao candidate rollout and persistent switch
