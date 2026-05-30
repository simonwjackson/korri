---
id: task-017
title: Tighten foreground-session transition and failure semantics
status: Done
priority: medium
labels:
  - foreground-session
  - sessiond
  - correctness
created: 2026-05-29
source: user
---

# Tighten foreground-session transition and failure semantics

## Context

The pure `foregroundSessionTransition` helper can construct arbitrary next states; legal ordering is enforced by `createForegroundSessionOwner` control flow. Failure semantics also span multiple layers: in-process owner stages, sessiond managed-launch failures, launch result failures, teardown/readiness failures, and restore recovery.

## Why it matters

As more launch types route through sessiond, unclear transition and failure semantics make bugs hard to diagnose and easy to paper over. The model should make illegal transitions and failure stages obvious to callers and tests.

## Acceptance Criteria

- [ ] Decide whether legal transition edges belong in the pure transition helper or remain documented as owner-level sequencing.
- [ ] If edges are encoded, tests cover invalid transitions and expected failures.
- [ ] If helper remains permissive, comments/tests make its responsibility clear.
- [ ] Failure stage mapping is normalized across prepare, spawn, foreground, exit, teardown, readiness, adapter, and restore failures.
- [ ] Abort behavior during teardown/readiness is covered and documented.
- [ ] Restore failure/recovering never surfaces as successful readiness.
- [ ] Public launch responses preserve useful failureKind/stderrTail without leaking internal-only details.
- [ ] Decide whether `PreflightRejected.preflightReason.currentState` (in-process owner FSM state — `Spawning`, `Running`, `TearingDown`, etc.) should be redacted or kept on the wire. Today it ships verbatim to any unauthenticated LAN caller of `app.library.launch`. Values are bounded enums (no credentials/PII), but the field gives a remote caller the owner's internal launch-pipeline stage without needing to poll `app.server.status`. Either (a) strip the field from the wire response and keep it server-side for logging, or (b) document that on the trusted-LAN deployment shape the owner FSM state is considered public information.

## Related

- `korri/shared/stream/foreground-session-lifecycle.ts`
- `korri/shared/stream/foreground-session-owner.ts`
- `korri/products/app/api/library/local-foreground-launch-adapter.ts`
- `korri/products/app/api/library/launch.rpc.ts`
- `korri/shared/library/session-launcher.ts`
- `tools/device/sessiond.ts`
- `tools/device/sessiond-state.ts`

## Notes

This is a correctness/refinement slice. Avoid broad architectural changes that belong in task-012.

2026-05-29: extended during task-012 (refactor/sessiond-canonical-lifecycle-source) review. The new `_tag: "PreflightRejected"` wire variant from task-012 adds `preflightReason.currentState` and `preflightReason.externalMode`; the `currentState` field is the in-process owner FSM tag and is the concrete instance behind the new acceptance criterion above. See `docs/plans/2026-05-29-004-refactor-sessiond-canonical-lifecycle-source-plan.md` and the se-security-reviewer SEC-001 finding.
