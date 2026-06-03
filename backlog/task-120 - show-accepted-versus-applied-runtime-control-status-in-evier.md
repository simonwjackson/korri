---
id: task-120
title: Show accepted versus applied runtime-control status in Evier
status: To Do
priority: medium
labels:
  - runtime-settings
  - evier
  - ui
  - product
  - status
created: 2026-06-03
source: user
---

# Show accepted versus applied runtime-control status in Evier

## Why it matters

Evier sends commands through the typed client, but the UI currently treats the immediate command response as the visible result. The contract says accepted is not success; users need to see whether a command is pending, applied, rejected, or unsupported based on observable state.

## Acceptance Criteria

- [ ] Evier displays command.accepted as pending/non-terminal, not as applied success.
- [ ] Evier refreshes or subscribes to state/events so applied status is shown only when applied bitrate/FPS/resolution matches the request.
- [ ] Host rejection, local rejection, timeout/no-terminal-outcome, and disabled state are visually distinguishable in plain language.
- [ ] Tests cover accepted-only, applied-with-matching-state, applied-with-mismatched-state, and rejected/unsupported outcomes.

## Related

- `backlog/task-091 - expose-runtime-stream-state-and-command-results-in-product-u.md`
- `backlog/task-119 - gate-product-runtime-controls-on-advertised-capabilities.md`
- `korri/shared/themes/evier/pages/EvierStreamControlPage.tsx`
- `korri/products/app/features/evier/stream-control-rpc-client.ts`
- `docs/acceptance/runtime-settings-protocol-contract.md`

## Notes

This is primarily a debug/product visibility item; it should reuse stream-control state rather than inventing new protocol states.
