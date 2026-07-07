---
id: 01KWYVE2RMJEFGEHVGSZ63V9BE
slug: expose-durable-adaptive-shed-convergence-state
title: Expose durable adaptive shed convergence state
origin: parked
status: To Do
priority: medium
labels:
  - stream-control
  - adaptive
  - observability
created: 2026-07-07
source: se-code-review
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  commit: e6c1d7ca2b0a
  repo: korri
---

# Expose durable adaptive shed convergence state

## Why it matters

Review found that `lastEvent` is transient: shed-converging, dispatched, and dispatch-failed events can overwrite each other, making CLI/RPC/agent validation miss active unresolved rescue or failed rescue commands. Durable state would make live validation and automation more reliable.

## Acceptance Criteria

- [ ] Adaptive snapshot exposes active shed convergence separately from transient lastEvent, or otherwise preserves last shed convergence/failure in a stable readback field.
- [ ] RPC/CLI state rendering has coverage for active shed convergence and failed unresolved shed commands.
- [ ] Runner/session tests cover rejected bitrate/FPS during unresolved shed convergence without collapsing to plain within-hysteresis.

## Related

- `product/platform/stream/stream-adaptive-runner.ts`
- `product/platform/stream/stream-session.ts`
- `product/apps/portal/api/stream-control/service.ts`
- `product/surfaces/terminal/korri-cli/stream-quality.ts`
