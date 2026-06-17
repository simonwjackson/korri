---
id: 01KVBNK266WD0D4GX2DSABA9QG
slug: design-generic-plugin-composition-diagnostics-for-cross-plug
title: Design generic plugin composition diagnostics for cross-plugin launch constraints
origin: parked
status: To Do
priority: medium
labels:
  - plugins
  - diagnostics
  - gamescope
  - moonlight
  - follow-up
created: 2026-06-17
source: se-challenge-plan
context:
  cwd: korri
  repo: korri
  invoked_by: user
---

# Design generic plugin composition diagnostics for cross-plugin launch constraints

## Why it matters

Removing the hardcoded Moonlight↔Gamescope Wayland compatibility check is necessary for plugin decoupling, but users still need actionable guidance when authored plugin combinations are incompatible. A generic diagnostics/constraint system can reintroduce helpful signaling without making plugins know about each other directly.

## Acceptance Criteria

- [ ] Plugins can declare generic constraints or diagnostics without importing specific sibling plugin implementations.
- [ ] Authored config combining Moonlight and Gamescope can produce a user-facing diagnostic for known incompatible settings through the generic mechanism.
- [ ] No platform or plugin code contains hardcoded Moonlight↔Gamescope special-case validation.

## Related

- `product/platform/stream/moonlight-launch-spec.ts`
- `product/plugins/gamescope/`
- `work/items/active/01KV8NZRAAETDX69P5T73BRVY8-first-party-plugin-system-shape/requirements.md`
