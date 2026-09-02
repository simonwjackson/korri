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
- Commits `1f349b3e` and `f582dfec` contain the final isolation and deployment gates.
- Sunshine now captures Wayland SHM frames and uploads them through CUDA for strict NVENC.
- Physical acceptance found Sway SHM format `DRM_FORMAT_BGR888` with value `875710274`.
- Commit `44f0d443` converts the observed 24-bit format to the BGRA byte order used by CUDA.
- The current Sunshine gate rejects unsupported SHM formats, capture failures, scaling failures, X11 capture, and encoder fallback.
- Korri now includes the established Neverball route beside the moving video gate when host validation is enabled.
- Bandai streamed moving Neverball frames at 1920x1080 with 59.93 to 61.10 incoming FPS and 0.00% network loss.
- Five consecutive image comparisons changed between 465,463 and 481,846 pixels.
- The stream used `h264_nvenc`, the stable Wayland display, and no fallback encoder.
- The live game unit passed the Xwayland, Wayland, control-path, and PID namespace isolation gates.
- Commit `19781905` focuses the workspace child before it enables fullscreen.
- The exact compositor action changed the floating Neverball window from 800x600 and `fullscreen_mode=0` to 1920x1080 and `fullscreen_mode=1`.
- The inputd dispatcher and action limits have automated coverage. This record does not claim a physical inputd chord through Neverball.
- Neverball support for the newer Linux joystick interface remains outside this acceptance.
- Commit `6ba25785` selects the bundle declared by each system generation.
- The same commit stops InputPlumber and restores raw joystick state before rollback activation.
- Commit `b56b7ef0` preserves rollback for older generations that do not declare a bundle selector.
- The guarded rollback restored the exact old generation and bundle before the persistent switch.
- Zao now uses `/nix/store/d62kzbx1g685f0fq6jm8qsqg4ghkblxw-nixos-system-zao-26.05.20260313.c06b4ae` as its current and default generation.
- Zao now uses `/nix/store/92zlzz0q6gkh68j8hs8ivv46hs4785ig-korri-bundle-0.0.0` as its active bundle.
- InputPlumber, inputd, Korrid, Sway, and Sunshine are active. Xvfb is inactive.
- No game, marker, or rollback lease remains active.
- Bandai returned to 1280x720, 60 FPS, codec `auto`, unlock-FPS false, and performance overlay false.
- The final physical record is `docs/acceptance/sunshine-korri-sway-physical-2026-09-02.md`.
- This item graduated from `work/items/parking-lot/`. The original text is in `item.md`.

## Execution tracker

- [x] U1: Headless capture and boundary spike
- [x] U2: Compositor session in the Linux host module
- [x] U3: Game environment and moving gate on Xwayland
- [x] U4: Inputd compositor control action
- [x] U5: Zao candidate rollout and persistent switch

## Completion

Completed on 2026-09-02. Zao now uses the accepted headless Sway generation and the matching Korri bundle.

The full acceptance record is `docs/acceptance/sunshine-korri-sway-physical-2026-09-02.md`.
