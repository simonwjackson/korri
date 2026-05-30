---
id: task-046
title: Isolate sessiond lifecycle event observation
status: Done
priority: medium
labels:
  - architecture
  - refactor
  - sessiond
  - sse
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

# Isolate sessiond lifecycle event observation

## Why it matters

`observeManagedLaunchEvents` is a dense SSE/reconnect/readiness state machine inside `session-launcher.ts`. Extracting it would give the SSE three-layer defense and Phase 4D session lifecycle observation a focused public contract without bloating the launcher adapter.

## Acceptance Criteria

- [ ] A dedicated lifecycle event observer module exposes a small contract for observing a sessiond `launchId` and producing exit, readiness, and final launch result signals.
- [ ] The observer owns SSE parsing, bounded reconnect, replay tolerance, readiness timeout, child/launcher/wait-monitor terminal handling, anchor termination handling, and recovering/failure mapping.
- [ ] `session-launcher.ts` delegates event observation to the new module while preserving current `ManagedLaunchResult` behavior and termination hooks.
- [ ] Tests cover reconnect, early stream close, event stream rejection, readiness timeout, `home-ready`, `idle-ready`, `recovering`, wait-monitor, and session-anchor paths through the observer contract.
- [ ] The existing SSE runtime-error solution points to the observer module as the home of the reconnect/heartbeat contract.

## Related

- `korri/shared/library/session-launcher.ts`
- `korri/shared/library/session-launcher.test.ts`
- `korri/shared/library/sessiond-managed-launch-protocol.ts`
- `tools/device/sessiond.ts`
- `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md`
- `backlog/task-039 - cover-sessiond-ts-managed-launch-http-sse-surface.md`

## Notes

Captured from the sessiond architecture-improvement scan. This is distinct from daemon-side SSE coverage; it deepens the client-side observer seam.

## Completion Notes

2026-05-30: Added `korri/shared/library/sessiond-managed-launch-event-observer.ts` and moved the client-side SSE/reconnect/readiness state machine out of `session-launcher.ts`. Direct observer tests cover reconnect, rejection, readiness timeout, home/idle readiness, recovering, wait-monitor, and anchor paths.
