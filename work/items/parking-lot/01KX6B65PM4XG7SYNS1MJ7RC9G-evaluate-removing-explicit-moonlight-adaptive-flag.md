---
id: 01KX6B65PM4XG7SYNS1MJ7RC9G
slug: evaluate-removing-explicit-moonlight-adaptive-flag
title: Evaluate removing explicit Moonlight adaptive flag
origin: parked
status: To Do
priority: medium
labels:
  - moonlight
  - stream-control
  - config
  - adaptive
created: 2026-07-10
source: user
---

# Evaluate removing explicit Moonlight adaptive flag

## Why it matters

The unified `moonlight.stream` surface may be able to infer adaptive behavior from natural per-lever shorthand/range authoring, avoiding a second boolean users must understand and keep in sync with resolution/fps/bitrate policy.

## Acceptance Criteria

- [ ] Document whether adaptive can be inferred solely from `moonlight.stream` shapes: scalar shorthand locks min/start/max, expanded ranges enable adaptation for that lever, and all-locked values disable adaptation.
- [ ] Identify any cases where an explicit adaptive flag is still needed, such as runtime kill switch, device default, or compatibility override.
- [ ] If feasible, propose a migration path that removes or de-emphasizes the explicit flag without reintroducing a separate `moonlight.adaptive.boundaries` config surface.
- [ ] Update docs/tests or create a follow-up implementation item with exact config examples.

## Related

- `product/plugins/moonlight/src/config/policy.ts`
- `product/platform/library/config/inheritable-fields.ts`
- `product/apps/portal/stream/moonlight-launcher.ts`
- `docs/korri-stream-adaptive-validation-runbook.md`

## Notes

User intent: investigate replacing the explicit adaptive flag with behavior implied by natural `moonlight.stream` shorthand/range syntax for each stream lever.
