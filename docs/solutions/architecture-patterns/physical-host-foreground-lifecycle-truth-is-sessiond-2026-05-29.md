---
title: Physical-host foreground lifecycle truth lives in sessiond
last_updated: 2026-05-29
date: 2026-05-29
category: architecture-patterns
module: korri/shared/stream + korri/products/app/api + tools/device/sessiond
problem_type: architecture_pattern
component: device
severity: high
applies_when:
  - "A Korri host (kiosk or source-machine) runs sessiond as its foreground-session supervisor"
  - "Designing a status surface or rejection path that needs to know whether the host is currently idle, launching, or running a foreground app"
  - "Touching `ForegroundSessionOwner`, `app.server.status`, or any renderer atom that reflects host readiness"
tags: [sessiond, foreground-session, lifecycle, korri, architecture, rpc, atom-react]
---

# Physical-host foreground lifecycle truth lives in sessiond

## Context

Korri's foreground-session arc shipped in four phases:

1. **Phase 1 (`docs/plans/2026-05-26-006-...`):** Introduced the generic `ForegroundSessionOwner` contract and a desktop-local owner that supervises the current Moonlight/Gamescope stream path with re-entry rejection.
2. **Phase 4B (`docs/plans/2026-05-26-012-...`):** Wired `sessiond` as a managed launcher adapter. Sessiond's `/managed-launch` endpoint becomes the spawn path; `app.server.status` started proxying sessiond's mode/active/phase/failure via `probeSessiondStatus`.
3. **Lifecycle-session intent routing (`docs/plans/2026-05-27-003-...`):** Routed `lifecycle: "session"` launcher-anchor intents through sessiond so the source-machine runner stops being a parallel foreground supervisor.
4. **This decision (task-012 / `docs/plans/2026-05-29-004-...`):** Closes the remaining seam — collapses split lifecycle truth between the in-process `ForegroundSessionOwner` and external sessiond into one authoritative source.

Before this decision, two voices answered "is this host ready?":

- The in-process `ForegroundSessionOwner` guarded `app.library.launch` using only its own in-process state machine.
- External sessiond owned the actual host graphical/session state and could also reject a `/managed-launch` POST as busy.

An out-of-band `/managed-launch` POST (a direct hit on sessiond from outside the app) could put sessiond in `game` mode while the renderer continued to display the host as idle. The renderer's `/__korri/desktop/foreground-session-status` endpoint was hardcoded to `IdleReady` regardless — it never read sessiond at all.

The two rejection paths (local owner busy vs sessiond busy) also collapsed to indistinguishable `failureKind: "session-busy"` on the wire. Operators, UI, and agents could not tell which guard fired without consulting daemon logs.

## Decision

**Sessiond is the authoritative source of foreground-session lifecycle truth for a physical Korri host.** The renderer atom, `app.server.status`, and `ForegroundSessionOwner`'s preflight all read sessiond's mode when sessiond is configured. The bridge endpoint that fabricated `IdleReady` is deleted.

**`ForegroundSessionOwner` is an adapter pipeline orchestrator with preflight re-entry protection.** Its actual contract is `prepare → spawn → foreground → teardown → verifyReady` with abort control, event history, and active-handle tracking. The preflight is one layer of that pipeline. The owner is NOT a parallel lifecycle source — it is the orchestrator that delegates the idle/busy gate to sessiond.

**`app.server.status` is the canonical server-side proxy surface** for sessiond mode, active, phase, and failure. The renderer reads sessiond state through this RPC; sessiond does not become a renderer-facing protocol. The Phase 4B boundary holds.

**Launch rejections discriminate their source** via a `_tag` union returned in the RPC `success` channel: `Accepted | PreflightRejected | DaemonRejected | HostUnavailable | LaunchFailed`. `PreflightRejected` further discriminates `reason.source: 'owner-local' | 'sessiond'` so operators can distinguish a local re-entry guard from a sessiond-busy preflight observation.

## Why this shape

- **Single source of truth for the host's foreground state.** The daemon already owns the renderer process, the foreground-session state machine, and the role-specific idle target. Adding the in-process owner as a second source produced split-brain. Reading sessiond's state during the owner's preflight collapses the truth without removing the orchestrator that the launch pipeline needs.
- **Preflight catches out-of-band callers.** A direct `/managed-launch` POST that bypasses `app.library.launch` is detected on the next call when the owner's preflight queries sessiond's mode. The user sees `PreflightRejected` with `reason.source: 'sessiond'` instead of a confusing spawn-time failure.
- **The renderer never talks sessiond directly.** Phase 4B established that sessiond is not a renderer-facing protocol. The atom polls `app.server.status` over standard `/api/rpc` at 1 Hz — the same RPC channel renderer code already uses for the rest of the app. No new bun-side bridge endpoints; no SSE three-layer defense burden for a status surface that polls fine.
- **Typed rejection makes the host's state machine legible from outside.** Tagging the rejection source removes the operator burden of consulting daemon logs to decide whether the local preflight rejected the launch or sessiond did.

## Consequences

- The hardcoded `/__korri/desktop/foreground-session-status` bridge endpoint is deleted. Renderer atoms that need lifecycle state read `app.server.status` instead. The live-USB `ForegroundSessionStatusLayerFixture` path is untouched.
- Every launch with sessiond configured now performs three loopback HTTP round-trips: the owner's preflight `GET /managed-launch/status`, the session-launcher's internal `GET /managed-launch/status`, and the spawn `POST /managed-launch`. Desktop-class latency is sub-50 ms total; ARM device worst-case under gaming load is validated on Sobo before the plan is declared verified.
- A token-rejected (HTTP 401) sessiond response preserves the existing `failureKind: 'host-control-disabled'` / exit-code 126 contract from `session-launcher.ts`. The new `HostUnavailable._tag` is independent of the wire failureKind so back-compat callers continue to work.
- `buildServerStatusEffect` includes `sessiondUnavailable: true` for both network-unreachable and token-rejected probe results, preserving the existing operator monitoring signal.

## What this is NOT

- This is NOT a structural restructure of `ForegroundSessionOwner` into a Layer-swappable Effect Service. The owner stays a plain object returned by `createForegroundSessionOwner` and accessed via `ForegroundSessionHost.owner`. That restructure is out of scope.
- This is NOT a renderer-side cancellation surface. Cancellation of an active sessiond launch is a future task (covers origin AE7).
- This is NOT a sessiond protocol or wire-shape change. The daemon's `/managed-launch/{status,events}` endpoints are unchanged.
- This is NOT a `gameStream.sessiond` config change. Existing nix module attrs (`services.korri.server.sessiond.{url,tokenFile}` and `services.korri.gameStream.sessiond.{url,tokenFile}`) continue to apply.

## Cross-references

- **Origin brainstorm:** `docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md`
- **Predecessor plans:**
  - `docs/plans/2026-05-26-006-feat-foreground-session-lifecycle-phase1-plan.md` (generic owner contract)
  - `docs/plans/2026-05-26-012-feat-sessiond-managed-lifecycle-events-plan.md` (sessiond as managed adapter; `app.server.status` proxy boundary)
  - `docs/plans/2026-05-27-003-feat-sessiond-session-lifecycle-unification-plan.md` (lifecycle-session intent routing)
- **This plan:** `docs/plans/2026-05-29-004-refactor-sessiond-canonical-lifecycle-source-plan.md`
- **Related decisions:**
  - `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md` (single-owner invariant for the renderer process)
  - `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md` (session owns focus/fullscreen; Gamescope is an adapter)
  - `docs/solutions/runtime-errors/effect-rpc-server-headers-concat-undefined-crash-2026-05-27.md` (envelope-guard requirement)
  - `docs/solutions/runtime-errors/kiosk-renderer-local-launch-rpc-decode-failure-2026-05-27.md` (bun-bridge deletion precedent)
  - `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md` (why polling, not renderer-side SSE)
  - `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md` (fail-closed contract origin)
