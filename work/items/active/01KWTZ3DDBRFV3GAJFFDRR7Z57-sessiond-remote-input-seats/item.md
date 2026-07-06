---
id: 01KWTZ3DDBRFV3GAJFFDRR7Z57
slug: build-sessiond-remote-input-seat-service-for-stream-safe-emu
title: Build sessiond remote input-seat service for stream-safe emulator launches
origin: parked
status: To Do
priority: high
labels:
  - input
  - remote-play
  - sessiond
  - controller-routing
  - rpcs3
  - architecture
created: 2026-07-06
source: user
---

# Build sessiond remote input-seat service for stream-safe emulator launches

## Why it matters

Remote emulator launches currently depend on stream-client/controller timing: RPCS3 can boot before Sunshine creates its virtual pad, so the game misses the controller until restart or manual input. A generic sessiond-owned input-seat service would make controller availability an explicit launch prerequisite, support drop-in remote players, and avoid emulator-specific sleeps/restarts/wiggle hacks.

## Acceptance Criteria

- [ ] sessiond exposes a generic input-seat service that allocates per-session emulator-visible seats (default P1..P4) before launching the emulator and releases them when the game session ends.
- [ ] Launch prepare fails before emulator spawn with a clear status/error when required seats cannot be created or verified.
- [ ] Seat pool size follows the normal config cascade: launcher/plugin capability/defaults, release override, release-profile override; releases can opt down from the default full pool.
- [ ] Seat state is observable through status/events/logs: available, occupied-connected, occupied-disconnected-reserved, released, plus source/seat/session identity where available.
- [ ] Remote input is modeled behind a RemoteInputSource adapter; Sunshine/Moonlight is the first adapter, with room for a Korri-native remote input protocol later.
- [ ] Disconnect and intentional leave are distinct: disconnect reserves the player seat; explicit leave releases it for a later player.
- [ ] Verification includes unit/integration tests for allocate/bind/disconnect/release/status plus hardware proof with Skate 3/RPCS3 and one second emulator/runtime.

## Related

- `work/items/parking-lot/01KWK4BCJ2BDM1JTVF7B3T2JF0-codify-all-skate-3-stream-fidelity-hacks-once-rpcs3-plugin-c.md`
- `work/items/active/01KWM7Q408P6VW6RWR66SE6R3R-rpcs3-input-config-authoring/convergence-note.md`
- `work/items/parking-lot/01KWTW9DBY5NN34BVN7CMXQ8W3-explore-unified-local-and-remote-controller-routing-throug.md`
- `product/services/device/sessiond.ts`
- `product/services/device/inputd-actions.ts`
- `product/plugins/rpcs3/src/materializer.ts`
