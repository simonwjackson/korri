---
id: task-071
title: Review RetroArch remote command controls
status: To Do
priority: medium
labels:
  - retroarch
  - security
  - control
created: 2026-06-08
source: se-challenge-plan
---

# Review RetroArch remote command controls

## Why it matters

RetroArch remote command configuration can open a local command surface on locked product devices. The active config expansion defers it until the security posture for kiosk/handheld deployments is explicit.

## Acceptance Criteria

- [ ] Document whether network_cmd_enable and related command/control keys are allowed, blocked, or gated per deployment profile.
- [ ] If allowed, add typed schema/rendering/tests for the safe subset.
- [ ] If blocked, add validation tests proving readable policy and extraSettings cannot enable the prohibited surface.

## Related

- `docs/plans/2026-06-08-004-feat-full-retroarch-config-plan.md`
- `product/platform/stream/retroarch-launch-spec.ts`
