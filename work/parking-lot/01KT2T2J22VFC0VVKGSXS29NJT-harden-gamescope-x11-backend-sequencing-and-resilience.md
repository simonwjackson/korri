---
id: 01KT2T2J22VFC0VVKGSXS29NJT
slug: harden-gamescope-x11-backend-sequencing-and-resilience
title: Harden Gamescope X11 backend sequencing and resilience
origin: parked
legacy: task-107
status: To Do
priority: high
labels:
  - gamescope
  - runtime-control
  - x11
  - resilience
  - sequencing
  - tests
created: 2026-06-02
source: user
---

# Harden Gamescope X11 backend sequencing and resilience

## Why it matters

Bandai validation already found that wedged Xwayland commands can hang clients; the backend needs full timeout, readback, mismatch, and sequencing coverage before it is trusted in product runtime flows.

## Acceptance Criteria

- [ ] Cover xprop, xrandr, and xwininfo timeout and nonzero-exit behavior with mocked backend tests.
- [ ] Report applied state or explicit readback mismatch errors for mode/filter/sharpness commands.
- [ ] Handle Gamescope/Xwayland absent and Gamescope exiting while the bridge is alive without wedging the bridge.
- [ ] Stress rapid mode changes, repeated same-mode requests, filter toggles during mode changes, and sharpness changes while FSR is active; add a serialized command queue if validation shows it is needed.

## Related

- `korri/shared/gamescope-control/x11-gamescope-control-backend.ts`
- `korri/shared/gamescope-control/x11-gamescope-control-backend.test.ts`
- `korri/shared/gamescope-control/gamescope-control-bridge.ts`
- `./01KT2T2J1N1W0680KVJ0ZKF5S9-add-safety-guardrails-for-runtime-resolution-commands.md`
- `./01KT2T2J1YK1SN1ZK0B8W0KBXJ-build-full-gamescope-rpc-control-api.md`

## Notes

PR phase 3. Builds on the v1 timeout fix and turns backend behavior into explicit coverage.
