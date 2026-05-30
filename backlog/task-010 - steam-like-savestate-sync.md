---
id: task-010
title: Steam-like save-state sync across devices
status: To Do
priority: medium
labels:
  - savestate
  - sync
  - library
created: 2026-05-29
source: user
---

# Steam-like savestate sync

## Context

Sync emulator / game save states across Korri devices the way Steam Cloud syncs saves: on session exit, upload the canonical state; on session start on another device, pull the latest before launch, with conflict handling.

## Why it matters

Save sync is the single feature that makes a multi-device handheld + TV + dev-box setup feel like one library instead of three. It's also the foundation for "pick up where you left off" across users (task-008) and for any future cloud-streaming bridge.

## Acceptance Criteria

- [ ] Storage/transport model documented in `docs/solutions/` (where canonical state lives, conflict resolution, eviction).
- [ ] Effect Schema contract for the sync RPC, with typed errors discriminated on `_tag`.
- [ ] Pull-on-launch and push-on-exit wired into sessiond's session lifecycle without blocking launch on transient failures.
- [ ] Conflict resolution surface in the portal (`Synced`, `Conflict`, `OfflineFallback` states).
- [ ] Two-device end-to-end smoke: launch on device A, exit, launch on device B, resume from same state.

## Related

- backlog/task-008 - multi-user-support.md
- backlog/task-009 - sessiond-100-percent-test-coverage.md
- `korri/shared/library/`

## Notes

Large; promote to `se-plan` before execution. Likely depends on the identity/auth seam mentioned in task-007/task-008.
