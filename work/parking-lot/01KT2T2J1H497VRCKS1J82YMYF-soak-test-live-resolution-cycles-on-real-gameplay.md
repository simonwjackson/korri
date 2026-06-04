---
id: 01KT2T2J1H497VRCKS1J82YMYF
slug: soak-test-live-resolution-cycles-on-real-gameplay
title: Soak test live resolution cycles on real gameplay
origin: parked
legacy: task-088
status: To Do
priority: high
labels:
  - streaming
  - hardware-validation
  - gameplay
  - runtime-resolution
created: 2026-06-02
source: user
---

# Soak test live resolution cycles on real gameplay

## Why it matters

Moving test patterns proved the core transport works, but final confidence requires repeated game-scene switches with live input and no reconnect across time.

## Acceptance Criteria

- [ ] Run repeated 1080p -> 360p/576p -> 1080p cycles while LEGO Batman or another game is active.
- [ ] After each switch, send bandai-originated input and verify host and bandai captures both reflect motion/state changes.
- [ ] No Moonlight reconnect, no Sunshine restart, and no frozen DSI-2 frames across the soak.
- [ ] Record bandwidth and frame-quality observations for each quality mode.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `tools/scripts/live-runtime-resolution-gate.sh`
- `packages/sunshine-korri/patches/0012-persist-runtime-config-and-reinit-capture-after-resolution.patch`
- `packages/sunshine-korri/patches/0013-request-async-capture-reinit-after-runtime-resolution.patch`
- `packages/sunshine-korri/patches/0014-skip-runtime-vaapi-destructor-flush.patch`

## Notes

Do not accept testsrc-only success as product proof. Game input must be sent from bandai after the switch and visibly affect the live game.
