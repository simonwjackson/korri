---
id: 01KWYVE2RPVV45VXNHJW65H65E
slug: centralize-adaptive-shed-target-normalization
title: Centralize adaptive shed target normalization
origin: parked
status: To Do
priority: medium
labels:
  - stream-control
  - adaptive
  - refactor
created: 2026-07-07
source: se-code-review
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  commit: e6c1d7ca2b0a
  repo: korri
---

# Centralize adaptive shed target normalization

## Why it matters

Review found the runner now mirrors controller policy for bitrate/FPS/resolution floors, min-delivered-FPS, aspect projection, pins, and ceilings. Keeping normalization duplicated risks future drift between initial shed decisions and follow-up convergence.

## Acceptance Criteria

- [ ] Shed target normalization/convergence target computation is owned by a single controller/helper module rather than duplicated in the runner.
- [ ] Runner tests continue to prove boundary recompute, min-fps floor, aspect preservation, and pinned lever behavior.
- [ ] Controller/runner API clearly separates policy computation from dispatch/readback orchestration.

## Related

- `product/platform/stream/stream-adaptive-controller.ts`
- `product/platform/stream/stream-adaptive-runner.ts`
- `product/platform/stream/stream-adaptive-controller.test.ts`
- `product/platform/stream/stream-adaptive-runner.test.ts`
