---
id: task-100
title: Add runtime-resolution recovery fallback
status: To Do
priority: high
labels:
  - live-resolution
  - reliability
  - product
  - safety
created: 2026-06-02
source: user
---

# Add runtime-resolution recovery fallback

## Why it matters

Even with the working fix, runtime resolution is high-risk. A shippable product needs recovery if a switch hangs, freezes, times out, or the host/client reports inconsistent state, ideally without leaving the user stranded on a black or frozen screen.

## Acceptance Criteria

- [ ] Switch commands have a watchdog based on ack, client state, and physical/stream health signals where available
- [ ] On failed switch, product attempts a safe revert or surfaces a clear recovery action
- [ ] Local-control state distinguishes applied, pending, failed, stale, and disconnected states
- [ ] Regression tests cover timeout/no-ack and frozen-frame scenarios

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `task-087`
- `task-091`
- `task-092`
- `tools/cli/moonlight-runtime-watch.ts`
- `korri/shared/stream/moonlight-control-client.ts`
