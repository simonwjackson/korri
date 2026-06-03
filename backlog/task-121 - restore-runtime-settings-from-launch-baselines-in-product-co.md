---
id: task-121
title: Restore runtime settings from launch baselines in product controls
status: To Do
priority: medium
labels:
  - runtime-settings
  - product
  - recovery
  - evier
created: 2026-06-03
source: user
---

# Restore runtime settings from launch baselines in product controls

## Why it matters

Evier has a hardcoded 1080/60/12 recovery button, but product restore should use the launch baseline values reported by runtime-settings state. Hardcoded recovery can be wrong for different games, displays, or launch profiles.

## Acceptance Criteria

- [ ] Stream-control state exposes launch baseline bitrate, FPS, and resolution when available.
- [ ] Product restore sends normal individual set commands back to launch baseline values; it does not use protocol auto-rollback or reconnect/restart.
- [ ] Restore is disabled or clearly unavailable when baseline values are missing.
- [ ] Tests cover baseline restore for bitrate/FPS/resolution and missing-baseline behavior.

## Related

- `backlog/task-058 - integrate-live-bitrate-controls-into-product-launches.md`
- `backlog/task-100 - add-runtime-resolution-recovery-fallback.md`
- `korri/products/app/api/stream-control/service.ts`
- `korri/shared/themes/evier/pages/EvierStreamControlPage.tsx`
- `docs/acceptance/runtime-settings-protocol-contract.md`

## Notes

This is explicit restore using baseline/current facts, not protocol auto-rollback and not a quality-profile command.
