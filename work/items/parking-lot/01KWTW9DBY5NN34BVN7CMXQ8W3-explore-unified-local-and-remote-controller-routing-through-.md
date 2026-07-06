---
id: 01KWTW9DBY5NN34BVN7CMXQ8W3
slug: explore-unified-local-and-remote-controller-routing-through-
title: Explore unified local and remote controller routing through Korri virtual seats
origin: parked
status: To Do
priority: medium
labels:
  - input
  - controller-routing
  - remote-play
  - local-play
  - architecture
created: 2026-07-06
source: user
---

# Explore unified local and remote controller routing through Korri virtual seats

## Why it matters

Remote input needs stable emulator-visible seats now, but whether local physical controllers should also route exclusively through the same virtual seat layer affects local play reliability, emulator config shape, InputPlumber ownership, and future couch/remote multiplayer semantics. Deferring the decision keeps the controller boot-race fix focused while preserving the architectural question.

## Acceptance Criteria

- [ ] Compare physical passthrough, all-virtual-seat routing, and hybrid session/emulator policies against at least RPCS3 plus one hotplug-friendly emulator.
- [ ] Document how each option handles local P1, remote drop-in P2, reconnect reservation, duplicate devices, and per-release opt-down seat pools.
- [ ] Recommend a default local-controller routing policy and identify the minimal InputPlumber/inputd/sessiond changes required.
- [ ] Capture migration risks for existing local-only launches and emulator input profiles.

## Related

- `work/items/parking-lot/01KWK4BCJ2BDM1JTVF7B3T2JF0-codify-all-skate-3-stream-fidelity-hacks-once-rpcs3-plugin-c.md`
- `work/items/active/01KWM7Q408P6VW6RWR66SE6R3R-rpcs3-input-config-authoring/convergence-note.md`
- `product/services/device/inputd-actions.ts`
- `product/services/device/overlay-intercept.ts`
