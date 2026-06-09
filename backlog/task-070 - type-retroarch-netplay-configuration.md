---
id: task-070
title: Type RetroArch netplay configuration
status: To Do
priority: medium
labels:
  - retroarch
  - netplay
  - config
created: 2026-06-08
source: se-challenge-plan
---

# Type RetroArch netplay configuration

## Why it matters

Netplay cfg and launch surfaces are deliberately skipped from the first broad RetroArch config wave because there is no current product requirement and the behavior crosses network/session boundaries. Capturing it separately prevents it from being mistaken for an accidental omission.

## Acceptance Criteria

- [ ] Decide which RetroArch netplay cfg keys belong in readable policy.
- [ ] Decide which netplay launch argv flows, if any, are product-supported.
- [ ] Add schema, cascade, renderer, and tests for accepted netplay fields without weakening generated config ownership.

## Related

- `docs/plans/2026-06-08-004-feat-full-retroarch-config-plan.md`
- `docs/brainstorms/2026-06-08-003-retroarch-policy-one-to-one.example.yaml`
