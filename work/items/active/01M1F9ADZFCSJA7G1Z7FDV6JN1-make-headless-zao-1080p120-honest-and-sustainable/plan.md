---
title: "perf(streaming): Sustain Zao 1080p120"
type: perf
status: active
date: 2026-09-02
verify_command: "nix run .#inputd-check"
---

# Sustain Zao 1080p120

## Goal

Leave Zao on the newest verified 1920x1080@120 generation and bundle. Use the current verified 1080p60 generation only as automatic failure recovery.

## Scope

- Measure the new Sway, Wayland SHM, CUDA, and strict NVENC path at 120 Hz.
- Use native 120 FPS moving content rather than duplicated 60 FPS content.
- Find and fix the measured bottleneck until Bandai receives at least 115 FPS with zero network loss.
- Persist the exact passing generation and bundle.

## Boundaries

- Require no controller action, cable change, visual confirmation, or other physical work.
- Do not reboot Zao while no physical recovery is available.
- Do not cap or reject 120 FPS as a substitute for fixing the path.
- Do not weaken the existing InputPlumber physical acceptance gate.
- Do not push or open a pull request without explicit approval.

## Execution units

1. Record the verified 1080p60 baseline and inspect the live compositor, DRM connectors, capture path, and client settings.
2. Add a deterministic native 1080p120 validation workload and module tests.
3. Configure the Zao consumer candidate for 1920x1080@120 and build it from a clean Mountainous worktree.
4. Activate the candidate with an on-device rollback lease and run automated stream acceptance through Bandai.
5. If the gate misses 115 FPS, measure one stage at a time and fix the first proven bottleneck.
6. Repeat until the gate passes, then persist the same generation and bundle.
7. Restore Bandai settings, prove Zao's final state, record acceptance, run checks and review, and land locally.

## Acceptance

- Sway reports 1920x1080 at 120 Hz.
- Bandai reports at least 115 incoming FPS during a bounded native-motion soak.
- Network frame loss remains 0.00 percent.
- The active stream uses Wayland capture and `h264_nvenc` in strict mode.
- Logs contain no unsupported SHM format, capture failure, scaling failure, X11 capture, VAAPI, or software encoder fallback.
- `/run/current-system` and `/nix/var/nix/profiles/system` resolve to the accepted candidate.
- The candidate bundle is active. No game, attempt marker, or rollback lease remains.
