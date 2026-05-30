---
id: task-035
title: Audit foreground-session-status-snapshot recentEvents.state leak (SEC-002)
status: To Do
priority: low
labels:
  - security
  - foreground-session
  - dead-code
created: 2026-05-29
source: se-code-review
context:
  cwd: .
  branch: refactor/foreground-session-failure-semantics
  repo: simonwjackson/korri
  invoked_by: se-code-review
---

# Audit foreground-session-status-snapshot recentEvents.state leak (SEC-002)

## Context

task-017's SEC-001 redaction removed `preflightReason.currentState` and the embedded FSM tag in `stderrTail` from the `app.library.launch` wire response. The se-security-reviewer flagged that `korri/deploy/desktop/foreground-session-status-snapshot.ts` (`eventSummary` function) still emits the owner FSM tag as `recentEvents[n].state` for `ForegroundSessionLaunchRejected` events.

This module was the body of the deleted `/__korri/desktop/foreground-session-status` bridge endpoint (removed in task-012). The serving route is gone — confirmed by `tools/desktop/desktop-smoke.test.ts` asserting the endpoint no longer serves JSON. The module + its tests are dead code today.

**Why this still matters:** the code is one route-mount away from re-exposing the FSM tag. A future operator-dashboard or debug endpoint that re-mounts the snapshot would silently re-introduce the same SEC-001 leak, with no test catching it (the snapshot test explicitly asserts the FSM tag IS in recentEvents).

## Why it matters

Dead code with a known information-disclosure shape is a latent regression. The snapshot tests actively assert the leaky shape; reviving the snapshot at any future endpoint would tip-toe past the SEC-001 guard in `local-foreground-launch-adapter.test.ts` because that guard only checks the launch RPC, not the snapshot.

## Acceptance Criteria

- [ ] Decide whether to keep, delete, or redact `korri/deploy/desktop/foreground-session-status-snapshot.ts`.
- [ ] If kept: redact FSM tag from `eventSummary` for `ForegroundSessionLaunchRejected` events (mirror the SEC-001 redaction in `local-foreground-launch-adapter.ts`) AND update the snapshot test to assert the redacted shape.
- [ ] If deleted: drop the module, the snapshot test file, and the `foreground-session-status-snapshot.test.ts` references. Verify no production code path imports the module.
- [ ] Consider also redacting `recentEvents[n].state` for accepted events (currently safe, but the principle is consistent).
- [ ] Wire-shape verification on the live `app.server.status` path: confirm the layer-live (`foreground-session-status-layer-live.ts`) does NOT depend on any field shape this snapshot module produces.

## Related

- `korri/deploy/desktop/foreground-session-status-snapshot.ts`
- `korri/deploy/desktop/foreground-session-status-snapshot.test.ts`
- `korri/products/app/features/home/foreground-session-status-layer-live.ts`
- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`

## Notes

Captured during task-017 Tier 2 review (se-security-reviewer SEC-002). Pre-existing on trunk; not introduced by task-017. Prioritized as `low` because the serving endpoint is removed; would be reclassified to `medium` if any future task proposes a new debug/operator dashboard backed by the snapshot.
