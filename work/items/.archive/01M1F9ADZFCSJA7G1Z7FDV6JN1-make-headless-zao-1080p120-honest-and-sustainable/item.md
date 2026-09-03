---
id: 01M1F9ADZFCSJA7G1Z7FDV6JN1
slug: make-headless-zao-1080p120-honest-and-sustainable
title: Make headless Zao 1080p120 honest and sustainable
origin: parked
status: Done
priority: medium
labels:
  - streaming
  - nvenc
  - headless
  - performance
created: 2026-09-01
source: user
---

# Make headless Zao 1080p120 honest and sustainable

## Why it matters

The earlier Xvfb path accepted 1920x1080@120 but did not sustain it. The new Sway, Wayland SHM, CUDA, and strict NVENC path needs its own 120 Hz acceptance.

## Acceptance criteria

- [x] A native moving 1920x1080@120 workload sustains at least 115 incoming FPS over a bounded soak with zero network drops.
- [x] Sway reports the intended 1920x1080@120 output mode during the accepted stream.
- [x] Sunshine uses Wayland capture and H.264 NVENC without X11, VAAPI, or software fallback.
- [x] The accepted generation and bundle become Zao's current and persistent configuration.
- [x] Failure restores the prior verified generation and bundle without leaving a game, marker, or rollback lease.
- [x] No physical action or visual confirmation is required.

## Related

- `services/inputd/nix/korri-linux-host.nix`
- `services/inputd/deploy/device-check.sh`
- `services/sunshine/`
- `docs/acceptance/sunshine-korri-sway-physical-2026-09-02.md`
