---
id: 01KZ7BJPNHCT8H6XC3Q67XS6A6
slug: add-exact-host-session-rollback-for-failed-stream-handoffs
title: Add exact host-session rollback for failed stream handoffs
origin: parked
status: To Do
priority: high
labels:
  - federation
  - session-lifecycle
  - moonlight
  - reliability
created: 2026-08-04
source: se-work
context:
  cwd: korri
  branch: feat/unified-android-game-overlay
  commit: c5b178da
  repo: korri
  invoked_by: U3 final review
---

# Add exact host-session rollback for failed stream handoffs

## Why it matters

A Moonlight native-start failure can occur after a federated host has already prepared the game. Exact rollback cannot be made reliable until host session stop accepts and verifies the prepared launchId; Zao currently reports SessionStopUnsupported, so the portal must presently refresh and expose the running session rather than promise cleanup.

## Acceptance Criteria

- [ ] SessionStop accepts an expected launchId and refuses to stop a replacement session.
- [ ] Zao implements graceful stop for its RetroArch route.
- [ ] Moonlight handoff failure stops exactly the session prepared by that attempt when it is still current.
- [ ] Tests cover replacement-session races and unsupported remote hosts.

## Related

- `clients/portal/src/surface/use-launchables.ts`
- `services/korrid/src/lib.rs`
- `services/korrid/src/host/prepare.rs`
