---
id: 01KT2T2J1YK1SN1ZK0B8W0KBXJ
slug: build-full-gamescope-rpc-control-api
title: Build full Gamescope RPC control API
origin: parked
legacy: task-103
status: To Do
priority: high
labels:
  - gamescope
  - rpc
  - runtime-control
  - product-api
  - ipc
created: 2026-06-02
source: user
---

# Build full Gamescope RPC control API

## Why it matters

Korri needs a single product-facing runtime-control surface for Gamescope, similar to Moonlight local control, rather than scattering behavior across gamescopectl, private Wayland requests, and X root properties. A typed RPC API enables individual runtime-control commands, UI state, automation, acknowledgements, and safety guards without adding a high-level quality-profile command.

## Acceptance Criteria

- [ ] Define a versioned Gamescope RPC protocol with hello/state/subscribe and command result semantics matching Korri control conventions.
- [ ] Implement a Unix-socket RPC bridge or native Gamescope patch exposing scaling, sharpness, FPS/refresh, HDR, VRR/adaptive sync, tearing, low latency, screenshots, display sleep/wake, and repaint controls.
- [ ] Report capabilities and unsupported controls at runtime based on available Gamescope protocol/features.
- [ ] Emit applied/failed/invalid/unsupported events with enough detail for product UI and automated gates.
- [ ] Add CLI and shared TypeScript client bindings for product and harness use.
- [ ] Include tests for protocol decoding/validation and hardware validation notes for live controls.

## Related

- `korri/shared/stream/moonlight-control-protocol.ts`
- `korri/shared/stream/moonlight-control-client.ts`
- `tools/cli/moonlight-control.ts`
- `/tmp/gamescope-ipc-investigation/gamescope`
- `./01KT2T2J1W62XXHTAJSHT1PZ7J-implement-gamescope-live-ipc-control-plane.md`

## Notes

Can start as a bridge over gamescope_control + gamescope_private + X root properties, then migrate stable operations into a patched/upstreamable gamescope_control protocol.
