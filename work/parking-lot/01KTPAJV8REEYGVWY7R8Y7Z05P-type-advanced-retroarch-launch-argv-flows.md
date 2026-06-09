---
id: 01KTPAJV8REEYGVWY7R8Y7Z05P
slug: type-advanced-retroarch-launch-argv-flows
title: "Type advanced RetroArch launch argv flows"
origin: parked
legacy: backlog/task-072
status: To Do
priority: medium
labels:
  - "retroarch"
  - "argv"
  - "config"
created: 2026-06-08
source: se-challenge-plan
---

# Type advanced RetroArch launch argv flows

## Why it matters

The broad config plan keeps the first implementation wave focused on generated retroarch.cfg settings and defers launch argv flows that could create duplicate authority or runtime side effects. Those flows still need a planned owner if Korri is to approach one-to-one RetroArch coverage.

## Acceptance Criteria

- [ ] Decide which replay, recording, automation, library scan/import, patch-argv, subsystem, and startup flags belong in typed policy.
- [ ] For every accepted typed argv field, expand extraArgs guards to prevent duplicate authority.
- [ ] Add renderer tests proving argv order and identity invariants remain stable.

## Related

- `docs/plans/2026-06-08-004-feat-full-retroarch-config-plan.md`
- `docs/brainstorms/2026-06-08-003-retroarch-policy-one-to-one.example.yaml`
- `product/platform/stream/retroarch-launch-spec.ts`
