---
id: task-043
title: Centralize the sessiond managed-launch client contract
status: Done
priority: medium
labels:
  - architecture
  - refactor
  - sessiond
  - client-contract
created: 2026-05-30
source: se-architecture-improvement
context:
  cwd: .
  branch: trunk
  commit: bb37a5b
  repo: simonwjackson/korri
  invoked_by: se-architecture-improvement
---

# Centralize the sessiond managed-launch client contract

## Why it matters

Sessiond status/token/failure semantics are currently split across the launcher, app.server.status, and local foreground launch preflight. Centralizing the client/probe contract would prevent drift in token handling, strict decode, capability checks, ready/busy classification, and host-control failure mapping.

## Acceptance Criteria

- [ ] A shared sessiond managed-launch client/probe module owns token resolution, auth header wiring, request timeout, strict decode, 401/missing-token/unavailable/invalid-payload classification, capability interpretation, launch-ready checks, start requests, and terminate requests.
- [ ] `korri/shared/library/session-launcher.ts` consumes the shared client for status preflight, start, and terminate behavior while preserving `ManagedLaunchResult` outputs.
- [ ] `korri/products/app/api/server/status.rpc-handler.ts` consumes the shared status probe and keeps LAN-facing redaction at the `app.server.status` seam.
- [ ] `korri/products/app/api/library/local-foreground-launch-adapter.ts` no longer imports the app server status handler just to consult sessiond; it adapts shared client results into `ForegroundExternalIdleResult`.
- [ ] Existing failure mappings are preserved, including token-rejected to `host-control-disabled`, network to `host-unavailable`, missing-token preflight behavior, and session-busy handling.

## Related

- `korri/shared/library/session-launcher.ts`
- `korri/shared/library/sessiond-managed-launch-protocol.ts`
- `korri/products/app/api/server/status.rpc-handler.ts`
- `korri/products/app/api/library/local-foreground-launch-adapter.ts`
- `korri/products/app/api/library/launch.rpc-handler.ts`
- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`

## Notes

Captured from the sessiond architecture-improvement scan. The key seam is consumer-side sessiond semantics; app-specific callers should still own their domain mappings.

## Completion Notes

2026-05-30: Added `korri/shared/library/sessiond-managed-launch-client.ts` as the shared managed-launch client/probe contract. `session-launcher.ts`, `app.server.status`, and `local-foreground-launch-adapter.ts` now consume it while preserving token, unavailable, invalid-payload, session-busy, and 401 failure mappings.
