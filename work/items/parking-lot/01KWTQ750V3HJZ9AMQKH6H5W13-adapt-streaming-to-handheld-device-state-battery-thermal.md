---
id: 01KWTQ750V3HJZ9AMQKH6H5W13
slug: adapt-streaming-to-handheld-device-state-battery-thermal
title: Adapt streaming to handheld device state (battery, thermal)
origin: parked
status: To Do
priority: low
labels:
  - streaming
  - adaptive-controller
  - battery
  - thermal
  - device-state
  - task-067
created: 2026-07-06
source: user
---

# Adapt streaming to handheld device state (battery, thermal)

## Why it matters

The adaptive stream controller currently models only network conditions. The handheld's own measured state is a legitimate, unambiguous adaptation trigger independent of the connection: low battery (conserve power) and thermal throttling (device overheating -> reduce decode load/heat by shedding pixels/fps). Unlike auto-per-network adaptation (rejected during alignment because it guesses user intent from context), device state is directly measured and unambiguous, so it may warrant automatic behavior. Deferred during the 2026-07-05 product alignment interview to keep the first controller focused on network adaptation, but it composes naturally with the same lever/outcome-clamp + lean machinery.

## Acceptance Criteria

- [ ] Decide the model: automatic tightening vs soft pressures the optimizer weighs vs a manual 'power saver' preset (or a mix).
- [ ] Wire battery percentage/charging state and thermal/throttle signals as controller inputs (or as a preset).
- [ ] Ensure device-state adaptation composes with the network-driven optimizer, the lean, and the clamps without fighting them.
- [ ] Emit signals for device-state-driven changes (observability-first) so a surface can explain 'reduced to save battery/heat'.

## Related

- `01KSXN94148T4616TA79KHQD9T`
