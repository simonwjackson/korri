---
id: task-042
title: Extract sessiond managed-launch supervisor
status: To Do
priority: medium
labels:
  - architecture
  - refactor
  - sessiond
  - foreground-session
created: 2026-05-30
source: se-architecture-improvement
context:
  cwd: .
  branch: trunk
  commit: bb37a5b
  repo: simonwjackson/korri
  invoked_by: se-architecture-improvement
---

# Extract sessiond managed-launch supervisor

## Why it matters

`tools/device/sessiond.ts` currently combines HTTP routing with the core foreground lifecycle brain, making launch/session/restore semantics harder to change and test without coupling to request dispatch. A dedicated supervisor would concentrate lifecycle state, events, termination, restore/recover behavior, and sidecar updates behind a stable contract while leaving the daemon file as an adapter.

## Acceptance Criteria

- [ ] `tools/device/sessiond.ts` is reduced to daemon shell responsibilities: Bun server startup, auth, route dispatch, request decode, JSON/SSE response adaptation, and production env wiring.
- [ ] A new supervisor module owns managed-launch acceptance, current phase, active launch identity, event history, termination, role restore/recover behavior, reaper invocation, sidecar updates, and managed status snapshots.
- [ ] Existing HTTP/SSE protocol behavior is preserved: endpoints, auth, status JSON, lifecycle event sequences, terminal event rules, sidecar writes, and restore failure semantics remain compatible.
- [ ] Supervisor behavior is covered through its public contract, with HTTP tests retained only for routing/auth/transport concerns.
- [ ] No `Mock*` / `Stub*` / `Fake*` doubles are introduced; harness implementations use configurable behavior/config arguments.

## Related

- `tools/device/sessiond.ts`
- `tools/device/sessiond.test.ts`
- `tools/device/sessiond-state.ts`
- `tools/device/sessiond-role.ts`
- `tools/device/sessiond-status-sidecar.ts`
- `tools/device/sessiond-gamescope-reaper.ts`
- `korri/shared/library/sessiond-managed-launch-protocol.ts`
- `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`
- `backlog/task-009 - sessiond-100-percent-test-coverage.md`
- `backlog/task-039 - cover-sessiond-ts-managed-launch-http-sse-surface.md`

## Notes

Captured from the sessiond architecture-improvement scan. This is refactor/deepening work, not a duplicate of task-039's coverage target; it should make future coverage and lifecycle changes easier.

## Progress Notes

2026-05-30: Adjacent prerequisite seams landed first: client-side observer extraction, shared client/probe contract, lifecycle projection seam, and typed role readiness evidence. The daemon-side supervisor extraction remains intentionally open because it is the larger move that should now build on those seams.

2026-05-31 (re-confirmed at trunk 7a5ed3b via se-architecture-improvement scan): the highest-leverage seam to factor is the closed-over `activeManagedLaunch` record inside `createKorriSessiondCore`. It is a hidden state machine — `{ launchId, cancelRequested?: "graceful" | "force", terminate?, terminateNow?, processGroupId?, cancelAnchor? }` — that is mutated from `runManagedLaunch`, `runSessionWaitMonitor`, `runSessionAnchor`, and `terminateManagedLaunchById`, co-evolved with `currentPhase` and the in-flight launch `Promise`. Today the only way to test cancel-during-wait-monitor or cancel-during-anchor interlocks is to drive the full daemon and observe through `handleRequest`, which is why `tools/device/sessiond.test.ts` is ~2.2k LOC. A `createManagedLaunchDispatcher({ launcher, role, reaper, state, lifecycle, logger })` with explicit `start` / `terminate` / `status` methods would let the active-launch record become private and let cancel-anchor be a dispatcher method rather than a closed-over resolver mutated from a route handler. Lifecycle event publication (ring buffer + subscribers + SSE + heartbeats + terminal detection) is a defensible second sub-seam to lift out at the same time.
