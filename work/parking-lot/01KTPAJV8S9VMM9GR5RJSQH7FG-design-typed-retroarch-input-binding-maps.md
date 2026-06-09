---
id: 01KTPAJV8S9VMM9GR5RJSQH7FG
slug: design-typed-retroarch-input-binding-maps
title: "Design typed RetroArch input binding maps"
origin: parked
legacy: backlog/task-073
status: To Do
priority: medium
labels:
  - "retroarch"
  - "input"
  - "config"
created: 2026-06-08
source: se-challenge-plan
---

# Design typed RetroArch input binding maps

## Why it matters

Full per-button input binding maps are intentionally excluded from the first expansion because the surface is very large and null/noop semantics are unclear. A dedicated design item prevents the input bind omission from disappearing behind extraSettings forever.

## Acceptance Criteria

- [ ] Define readable shape for per-port/per-button RetroArch bindings, or explicitly decide to keep bindings in extraSettings.
- [ ] Define null/omit/noop semantics, including whether RetroArch literal nul is supported.
- [ ] Add cascade merge rules and tests if typed binding maps are accepted.

## Related

- `docs/plans/2026-06-08-004-feat-full-retroarch-config-plan.md`
- `docs/brainstorms/2026-06-08-003-retroarch-policy-one-to-one.example.yaml`
- `product/platform/library/config/cascade-resolver.ts`
