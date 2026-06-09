---
id: task-069
title: Add RetroArch achievement secret resolution
status: To Do
priority: medium
labels:
  - retroarch
  - secrets
  - config
created: 2026-06-08
source: se-challenge-plan
---

# Add RetroArch achievement secret resolution

## Why it matters

The full RetroArch config plan intentionally rejects plaintext RetroAchievements credentials and defers secret injection. Without a follow-up item, achievements could remain half-typed or tempt future implementers to expose cheevos_password directly in readable YAML.

## Acceptance Criteria

- [ ] Define a Korri secret-reference contract for RetroArch achievement credentials.
- [ ] Readable YAML never accepts plaintext RetroArch credential fields such as cheevos_password.
- [ ] Materialization can inject resolved secrets into generated retroarch.cfg without persisting plaintext in library YAML.

## Related

- `docs/plans/2026-06-08-004-feat-full-retroarch-config-plan.md`
- `product/platform/library/config/inheritable-fields.ts`
- `product/platform/stream/retroarch-launch-spec.ts`
