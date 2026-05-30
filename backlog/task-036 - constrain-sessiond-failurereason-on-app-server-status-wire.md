---
id: task-036
title: Constrain sessiond.failureReason on app.server.status wire (SEC-003)
status: Done
priority: low
labels:
  - security
  - sessiond
  - operator-surface
created: 2026-05-29
source: se-code-review
context:
  cwd: .
  branch: refactor/foreground-session-failure-semantics
  repo: simonwjackson/korri
  invoked_by: se-code-review
---

# Constrain sessiond.failureReason on app.server.status wire (SEC-003)

## Context

`SessiondLifecycleSummary.failureReason` is forwarded verbatim from sessiond's `/managed-launch/status` to the `app.server.status` RPC response, where it reaches any unauthenticated LAN caller. The schema is `Schema.optional(Schema.String)` — no length or content constraint. Sessiond can populate this string with arbitrary text including:

- OS-level error messages (which may contain absolute filesystem paths)
- Username fragments (when permission or auth failures bubble through)
- Process names and PIDs from the host's runtime
- Stack-trace fragments depending on the daemon's logging discipline

The renderer-side `ForegroundSessionStatusLayerLive` threads `failureReason` into `snapshot.lastFailure.message`, which becomes the `message` field of a Recovering gate state.

## Why it matters

Operator-facing diagnostic strings often leak more host context than the operator realizes. On a trusted-LAN deployment shape, an unauthenticated peer can poll `app.server.status` indefinitely and capture every restore failure message sessiond emits, building a profile of host paths, daemon versions, and runtime state.

Bounded enums on this surface (sessiond mode, restoreAttempts) are designed-in; an unbounded string is not. The remediation cost is small relative to the long-tail risk.

## Acceptance Criteria

- [ ] Decide a constraint policy: (a) drop `failureReason` from the wire, keep on sessiond logs only; (b) clamp to N characters and strip path-shaped substrings; (c) replace with a bounded enum of `sessiond-side` failure-reason categories the daemon already discriminates on; (d) document the trusted-LAN assumption and accept the risk.
- [ ] If (b) or (c): update `SessiondLifecycleSummary.failureReason` schema and the renderer-side display.
- [ ] If (d): document in `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md` that `failureReason` is considered a public-on-LAN string by deployment shape.
- [ ] Coordinate with task-018 (operator model doc) so the decision is captured operator-facing.

## Related

- `korri/products/app/api/server/status.rpc.ts` — `SessiondLifecycleSummary` schema
- `korri/products/app/api/server/status.rpc-handler.ts` — populates from sessiond probe
- `korri/products/app/features/home/foreground-session-status-layer-live.ts` — threads into snapshot.lastFailure
- `tools/device/sessiond.ts` — sessiond's failureReason production code
- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`

## Notes

Captured during task-017 Tier 2 review (se-security-reviewer SEC-003). Pre-existing on trunk. Coupled to task-004 (stop running as root) and task-008 (multi-user) — if authentication lands on `/api/rpc`, the policy decision flips toward "include and authenticate" rather than "redact." Prioritized as `low` because exploit value on a home LAN is modest; reclassify if Korri ever ships a deployment shape with untrusted LAN peers.
