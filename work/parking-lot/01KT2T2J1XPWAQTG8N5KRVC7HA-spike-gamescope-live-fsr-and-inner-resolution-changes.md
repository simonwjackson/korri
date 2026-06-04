---
id: 01KT2T2J1XPWAQTG8N5KRVC7HA
slug: spike-gamescope-live-fsr-and-inner-resolution-changes
title: Spike Gamescope live FSR and inner-resolution changes
origin: parked
legacy: task-102
status: To Do
priority: high
labels:
  - gamescope
  - fsr
  - runtime-resolution
  - spike
  - ipc
created: 2026-06-02
source: user
---

# Spike Gamescope live FSR and inner-resolution changes

## Why it matters

Before building a full Gamescope control API, we need to prove which existing mechanisms can change FSR/scaler/sharpness and inner/Xwayland-advertised resolution live without restarting Gamescope, Moonlight, or the game. This de-risks the most valuable runtime-quality controls and separates real live behavior from logs or hotkey assumptions.

## Acceptance Criteria

- [ ] Demonstrate live FSR/filter/scaler/sharpness changes through a non-hotkey mechanism.
- [ ] Demonstrate or reject live inner/Xwayland advertised resolution changes through `GAMESCOPE_XWAYLAND_MODE_CONTROL` or an equivalent mechanism.
- [ ] Capture before/after Gamescope logs and state for each command path.
- [ ] Validate visible effect on bandai with physical DSI-2 captures, not just logs.
- [ ] Document which controls are safe, flaky, unsupported, or require a Gamescope patch.

## Related

- `/tmp/gamescope-ipc-investigation/gamescope`
- `docs/handoffs/live-runtime-resolution-journey.md`
- `./01KT2T2J1W62XXHTAJSHT1PZ7J-implement-gamescope-live-ipc-control-plane.md`

## Notes

Use cloned upstream Gamescope investigation at /tmp/gamescope-ipc-investigation/gamescope. Avoid Super+U as proof; use IPC/X properties/gamescopectl and physical DSI-2 captures.
