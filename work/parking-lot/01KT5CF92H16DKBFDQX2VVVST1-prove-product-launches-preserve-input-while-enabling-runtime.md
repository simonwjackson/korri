---
id: 01KT5CF92H16DKBFDQX2VVVST1
slug: prove-product-launches-preserve-input-while-enabling-runtime
title: Prove product launches preserve input while enabling runtime control
origin: parked
legacy: task-122
status: To Do
priority: high
labels:
  - runtime-settings
  - inputplumber
  - product
  - tests
  - launch
created: 2026-06-03
source: user
---

# Prove product launches preserve input while enabling runtime control

## Why it matters

Remote launches already pass the discovered InputPlumber virtual gamepad path. Enabling Moonlight local-control adds runtime dirs and environment variables; tests need to prove that this does not regress controller input or create reconnect/restart fallback behavior.

## Acceptance Criteria

- [ ] Remote product launch tests prove the Moonlight command still includes the resolved InputPlumber -input device when local-control is enabled.
- [ ] Tests prove local-control environment is added without changing the selected game/app/host arguments or Gamescope wrapping unexpectedly.
- [ ] InputPlumber missing/ambiguous cases still fail closed before launch.
- [ ] Unsupported runtime-control capability is surfaced as unsupported/disabled; no product code creates a reconnect/restart fallback launch path.

## Related

- `./01KSXN940WHC4SJ684MBEH0JNW-integrate-live-bitrate-controls-into-product-launches.md`
- `./01KT5CF92C0GE6W7V3DMKQNYGM-wire-moonlight-local-control-into-remote-product-launches.md`
- `korri/products/app/api/library/launch.rpc-handler.test.ts`
- `korri/products/app/api/stream/compose-moonlight-launch-spec.test.ts`
- `korri/products/app/api/stream/compose-moonlight-launch-spec.ts`

## Notes

This item closes the InputPlumber/controller part of the original task-058 acceptance after local-control launch wiring lands.
