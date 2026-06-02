---
id: task-095
title: Consolidate runtime-resolution Moonlight patches
status: To Do
priority: high
labels:
  - live-resolution
  - moonlight
  - cleanup
  - upstream
created: 2026-06-02
source: user
---

# Consolidate runtime-resolution Moonlight patches

## Why it matters

The current backlog covers Sunshine consolidation, but the working demo also depends on Moonlight decoder reopen, SDL presenter reset, local-control wiring, and diagnostic cleanup. Shipping or upstreaming needs the client-side patch stack reduced to minimal intentional changes with no stale diagnostic behavior.

## Acceptance Criteria

- [ ] Moonlight runtime-resolution patches are reduced to the minimal required set
- [ ] Diagnostic frame-hash logging is removed or gated behind an explicit debug option
- [ ] A clean 1080p -> 576p/360p -> 1080p physical gate still passes on bandai
- [ ] Patch descriptions explain why decoder reopen and presenter reset are required

## Related

- `packages/moonlight-embedded-korri/patches`
- `packages/moonlight-embedded-korri/package.nix`
- `task-082`
- `task-087`

## Notes

Added after reviewing backlog task-082 through task-094; Sunshine consolidation existed but Moonlight consolidation was missing.
