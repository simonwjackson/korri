---
id: task-101
title: Implement Gamescope live IPC control plane
status: To Do
priority: high
labels:
  - gamescope
  - runtime-control
  - streaming
  - ipc
created: 2026-06-02
source: user
---

# Implement Gamescope live IPC control plane

## Why it matters

Korri can already control Moonlight runtime quality in-session, but Gamescope scaling, filters, refresh policy, display sleep, screenshots, and mode-control are split across private Wayland IPC and X root properties. A first-class Korri wrapper/patch would let product code coordinate Moonlight stream changes with Gamescope compositor behavior in real time.

## Acceptance Criteria

- [ ] Expose a typed Korri Gamescope control client with hello/state/subscribe-style semantics matching the Moonlight local-control shape.
- [ ] Support live filter/scaler/sharpness, FPS/refresh-cycle override, display sleep/wake, screenshot, HDR/VRR/tearing/composite/debug toggles where upstream supports them.
- [ ] Add explicit runtime status/events for applied/failed/unsupported commands.
- [ ] Define and validate which nested/output resolution changes are supported without restarting Gamescope, and gate unsafe ones.
- [ ] Validate on bandai with physical DSI-2 captures for scaling/FSR claims.

## Related

- `korri/shared/stream/moonlight-control-protocol.ts`
- `korri/shared/stream/moonlight-control-client.ts`
- `docs/handoffs/live-runtime-resolution-journey.md`
- `packages/gamescope-korri`

## Notes

Investigation clone: /tmp/gamescope-ipc-investigation/gamescope at upstream 17be41f3a8528352580d3991cb375c2452ea0180.
