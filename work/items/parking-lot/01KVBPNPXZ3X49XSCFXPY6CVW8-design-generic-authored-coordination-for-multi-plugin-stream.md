---
id: 01KVBPNPXZ3X49XSCFXPY6CVW8
slug: design-generic-authored-coordination-for-multi-plugin-stream
title: Design generic authored coordination for multi-plugin stream controls
origin: parked
status: To Do
priority: medium
labels:
  - plugins
  - stream-control
  - coordination
  - follow-up
created: 2026-06-17
source: se-challenge-plan
context:
  cwd: korri
  repo: korri
  invoked_by: user
---

# Design generic authored coordination for multi-plugin stream controls

## Why it matters

Removing hardcoded linked Moonlight+Gamescope controls is necessary for plugin decoupling, but users may still want one control to coordinate multiple plugin-provided actions such as stream FPS and compositor FPS. A future generic authored-control mechanism can restore that UX without coupling plugins to each other.

## Acceptance Criteria

- [ ] Users or product config can declare a coordinated control that targets multiple plugin-provided actions without hardcoding specific plugin pairs in platform code.
- [ ] The stream-control capabilities API can describe coordinated controls generically to UI clients.
- [ ] Moonlight and Gamescope plugins do not import or directly know about each other to participate in coordination.

## Related

- `product/platform/stream-control/control-contract.ts`
- `product/platform/stream-control/control-surface.ts`
- `product/plugins/gamescope/src/stream-control/`
- `work/items/active/01KV8NZRAAETDX69P5T73BRVY8-first-party-plugin-system-shape/requirements.md`
