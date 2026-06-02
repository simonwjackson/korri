---
id: task-068
title: Prototype live Gamescope nested-resolution control for Moonlight
status: To Do
priority: medium
labels:
  - gamescope
  - moonlight
  - adaptive-streaming
  - bandai
created: 2026-05-31
source: user
---

# Prototype live Gamescope nested-resolution control for Moonlight

## Why it matters

The Gamescope source shows a partial live XWayland mode-control path, but it does not coherently update all nested-resolution state or guarantee Moonlight/Sunshine stream renegotiation. A focused prototype would determine whether adaptive 720p/900p/1080p scaling can be done without restarting the mobile stream.

## Acceptance Criteria

- [ ] Document exact Gamescope control surface used or added for changing nested width/height at runtime.
- [ ] Prove whether Moonlight under Bandai Gamescope receives and acts on the resize without process restart.
- [ ] Record behavior for XWayland and native Wayland child paths separately, including failures/blackouts.
- [ ] Measure latency/blackout/frame drops for 720p↔1080p transitions and compare with bitrate/FPS-only controls.

## Related

- `/tmp/gamescope`
- `backlog/task-066 - prove-seamless-runtime-resolution-scaling-on-bandai.md`
- `/root/aka-desktop-vbr-gamescope`

## Notes

Initial source reconnaissance found GAMESCOPE_XWAYLAND_MODE_CONTROL and wlserver_set_xwayland_server_mode as the likely seam; runtime FSR/filter changes are already supported, but live nested resolution is client-dependent and not a documented upstream CLI/API.
