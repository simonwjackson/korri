---
id: task-013
title: Enrich sessiond launch identity and protocol evolution
status: To Do
priority: medium
labels:
  - sessiond
  - protocol
  - observability
created: 2026-05-29
source: user
---

# Enrich sessiond launch identity and protocol evolution

## Context

The current launch identity is split across app request ids, game ids, foreground-session child ids, and sessiond `launchId`s. The in-process active session can expose `currentChildId`, but `sessionId` is not consistently populated from sessiond. The managed-launch protocol also uses strict Effect Schema decoding, which is safe but brittle for additive daemon changes.

## Why it matters

When a host is busy or recovering, the user/operator needs to know which launch is active. Agents also need stable identifiers to terminate, diagnose, and correlate events. Protocol changes should not accidentally break older clients without an intentional migration.

## Acceptance Criteria

- [ ] Active foreground-session state consistently records the sessiond `launchId` as `sessionId` where sessiond is the launcher.
- [ ] Busy rejections include the best available current request id, game id, session/launch id, child id, and process id when available.
- [ ] Decide whether sessiond-backed `ForegroundManagedSessionHandle` should expose process/process-group ids or explicitly document them as daemon-private.
- [ ] Managed-launch events/status include enough identity for correlation without leaking unnecessary process details.
- [ ] Add or document a protocol evolution rule: schemas are updated before the daemon emits new fields, or clients intentionally allow additive fields.
- [ ] Tests cover identity propagation through `app.library.launch`, `session-launcher`, and `sessiond` events.

## Related

- `korri/shared/stream/foreground-session-lifecycle.ts`
- `korri/shared/stream/foreground-session-owner.ts`
- `korri/shared/library/session-launcher.ts`
- `korri/shared/library/sessiond-managed-launch-protocol.ts`
- `korri/shared/library/launcher.ts`
- `korri/products/app/api/library/local-foreground-launch-adapter.ts`
- `tools/device/sessiond.ts`

## Notes

Keep this focused on contract identity and schema evolution; do not fold in status-surface ownership work from task-012.
