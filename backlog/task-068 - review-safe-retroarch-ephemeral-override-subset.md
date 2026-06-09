---
id: task-068
title: Review safe RetroArch ephemeral override subset
status: To Do
priority: medium
labels:
  - retroarch
  - security
  - config
created: 2026-06-08
source: se-plan
---

# Review safe RetroArch ephemeral override subset

## Why it matters

Expanded RetroArch policy intentionally keeps EphemeralOverride support deferred because app.library.launch can be unauthenticated on trusted-LAN deployments and RetroArch policy includes filesystem, argv, config, and secret-adjacent surfaces. A separate security review is needed before any runtime override subset can be exposed safely.

## Acceptance Criteria

- [ ] Document which RetroArch fields, if any, are safe for EphemeralOverride.
- [ ] EphemeralOverride either rejects retroarch policy at decode time or accepts only the reviewed safe subset.
- [ ] Cascade tests prove accepted RetroArch override fields reach resolved context and rejected fields fail clearly.

## Related

- `docs/plans/2026-06-08-004-feat-full-retroarch-config-plan.md`
- `product/platform/library/config/ephemeral-override.ts`
- `product/platform/library/config/cascade-resolver.ts`
