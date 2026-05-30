---
title: Sessiond operator model — one daemon per foreground-capable host
last_updated: 2026-05-29
date: 2026-05-29
category: architecture-patterns
module: tools/device/sessiond + korri/shared/library + nix/modules + nix/images
problem_type: architecture_pattern
component: device
severity: high
applies_when:
  - "Diagnosing a busy/restoring host on a Korri kiosk or source-machine deployment"
  - "Reasoning about which subsystem owns the host's foreground lifecycle"
  - "Wiring a new device role or relocating an existing role"
  - "Onboarding to the Korri sessiond architecture"
tags: [sessiond, operator, kiosk, source-machine, foreground-session, managed-launch, korri, supervisor, lifecycle]
---

# Sessiond operator model — one daemon per foreground-capable host

## Context

Sessiond is the host-local foreground-session supervisor for every Korri
device role that can run a foreground graphical application. Through eight
shipped tasks in the May 2026 sweep (task-011 through task-016 plus task-013,
task-017, task-034), sessiond's contract has settled into a coherent shape
that operators and agents can rely on. The knowledge is currently scattered
across plan documents, code comments, runtime-error solution docs, and
review reports.

This document is the consolidated **operator map**. It is not a tutorial; it
is the map an operator (or an agent) reaches for when something is broken
or about to be touched.

## The model in one line

> One sessiond per foreground-capable host. Sessiond owns the truth about
> whether the host can launch a managed app, what is currently running,
> and whether the host is back to its role-specific idle state.

Every Korri client surface — `app.library.launch`, `app.server.status`, the
renderer's gate state atom, the launcher-anchor protocol — defers to
sessiond for the host's lifecycle truth. The in-process
`ForegroundSessionOwner` is a preflight/re-entry guard, not a parallel
authority (see
`docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`).

## Roles and what "idle" means

Sessiond runs in exactly one of two roles per host. The role is fixed at
boot and inferred from the Nix image:

### Kiosk role
- **Idle wire label:** `home`
- **Terminal readiness event:** `home-ready`
- **What idle means:** Electrobun renderer is running, ES (`essway`) is
  masked, the Sway tree contains exactly one focused fullscreen Korri
  window.
- **Restore behavior:** stops the renderer for foreground launches,
  relaunches and reconciles the home invariant afterward.
- **Evidence format** (from task-015):
  `home-invariant windows=N [renderer-relaunched] [duplicates-closed=K] [focus-repaired] [fullscreen-repaired] [satisfied]`
  — `satisfied` appears only when no repair ran.

### Source-machine role
- **Idle wire label:** `idle`
- **Terminal readiness event:** `idle-ready`
- **What idle means:** Sway is alive, no Korri GUI client is present,
  no foreground app windows remain, no Gamescope residue (windows or
  `gamescope-wl` / `gamescopereaper` processes), and a cooldown has
  elapsed.
- **Restore behavior:** clears stale Gamescope windows, waits for
  lingering processes to exit, observes cooldown, then asserts
  idle-blank.
- **Evidence format** (from task-016):
  `idle-blank|windows={present,absent}|processes={present,absent}|cooldown={pending,elapsed}`

The role boundary lives in
`tools/device/sessiond-role.ts`; sessiond's dispatcher is role-agnostic
and calls into the role for `enterIdle`, `leaveIdle`, `beforeChildLaunch`,
`afterChildRunning`, `restoreIdleAfterLaunch`, and `reconcileIdle`.

Lifecycle vocabulary projection lives in
`korri/shared/library/sessiond-lifecycle-projections.ts`. That seam is
the canonical place to update mappings from sessiond internal mode/phase
to managed-launch status JSON, `app.server.status`'s sessiond summary,
and renderer foreground-session snapshots. Keep role idle aliases
(`home` for kiosk, `idle` for source-machine) and operator evidence
compatibility centralized there rather than duplicating switch tables in
RPC or renderer code.

## The managed-launch protocol

Sessiond exposes an HTTP/SSE protocol on a Unix domain socket (system
deployments) or a localhost TCP port (development). The token is in
`KORRI_SESSIOND_TOKEN` or `KORRI_SESSIOND_TOKEN_FILE`; the URL is in
`KORRI_SESSIOND_URL`. The schema lives in
`korri/shared/library/sessiond-managed-launch-protocol.ts`.

### Endpoints

| Verb | Path | Purpose |
|---|---|---|
| `GET`  | `/managed-launch/status`    | Mode + capabilities + active-launch snapshot |
| `POST` | `/managed-launch`           | Start a managed launch (`lifecycle: "foreground" \| "session"`, optional `wait`) |
| `GET`  | `/managed-launch/events`    | SSE stream of lifecycle events (filtered by `launchId`) |
| `POST` | `/managed-launch/terminate` | Graceful (default) or forced termination |
| `POST` | `/control/start`            | Role enters idle (mask units, launch renderer if applicable, reconcile) |
| `POST` | `/control/stop`             | Role leaves idle (tear down renderer if applicable, unmask units) |
| `POST` | `/control/reconcile`        | Idempotent reconciliation pass |

All endpoints require the `x-korri-sessiond-token` header. Unauthorized
requests get `401` and clients map this to
`failureKind: "host-control-disabled"` / exit code 126 (see
task-012's `local-foreground-launch-adapter.ts` /
`session-launcher.ts`).

### Expected event sequences

**Foreground launch** (`lifecycle: "foreground"`, the default):
```
child-running
  → (game runs)
  → child-exited { terminal: {exitCode, signal} }
  → restoring
  → home-ready | idle-ready
```

**Session-lifecycle launch** (`lifecycle: "session"`, requires
`capabilities.sessionLifecycle === true`):
```
child-running
  → (launcher runs)
  → launcher-exited
  → wait-monitor-running     // when wait spec supplied
  → wait-monitor-exited      // OR ↓
  → session-anchored         // when no wait spec; sessiond holds anchor
  → (terminate-from-anchor)  // operator/wire-driven
  → restoring
  → home-ready | idle-ready
```

The `failureKind: "host-control-disabled"` failure fires when sessiond
lacks `sessionLifecycle` capability and the client requested
`lifecycle: "session"` (see `session-launcher.ts`'s capability check).

### Identity correlators (task-013)

Every launch carries a server-generated `launchId` that appears on:
- `SessiondManagedLaunchActive.launchId` (status response)
- Every event in `/managed-launch/events`
- `/managed-launch/terminate` request body
- The in-process owner's `active.sessionId` (after spawn)
- The wire response on busy rejection: `preflightReason.currentSessionId`

Process identity (`processId`, `processGroupId`) is **daemon-private**
by design — see task-013 AC #3 and
`korri/shared/stream/foreground-session-lifecycle.ts`'s
`ForegroundSessionBusyRejection` docstring.

## Operator diagnostics

### "Host says it's busy but I can't see what's running"

1. `GET /managed-launch/status` — `active.launchId` + `active.mode` + `active.phase`.
2. Tail sessiond's journal (`journalctl -u korri-sessiond`) for `launcher-exited`, `wait-monitor-exited`, or `session-anchored` events around the busy time.
3. Cross-reference `launchId` with the application's `app.library.launch` response — the busy rejection's `preflightReason.currentSessionId` is the same value.

### "Black screen on the kiosk after game exit"

1. Check sessiond's `idleReadyEvidence` in the last `home-ready` event:
   - `[satisfied]` absent → home invariant was repaired, but something else is wrong
   - `windows=0` → Sway lost the renderer window
   - `[renderer-relaunched]` followed by another failure → the relaunch itself isn't sticking
2. Check Electrobun's journal (renderer-side) for crashes during relaunch.
3. Check `restoreAttempts` in the status response — `>= 3` means sessiond will stop trying.

### "Source-machine can't accept a stream"

1. `GET /managed-launch/status` — must be `mode: "idle"`.
2. If `recovering`: `failureReason` is the human-readable cause. Note that the `app.server.status` wire copy is **redacted** (SEC-003 / task-036): absolute paths become `<path>` and the string is clamped to 256 chars. The sessiond-local journal copy is unredacted; cross-reference there for path-bearing diagnostics.
3. If still `restoring`: check `idleReadyEvidence` for which sub-check is failing (`windows=present`, `processes=present`, `cooldown=pending`).
4. Lingering Gamescope processes: see `sessiond-gamescope-reaper.ts` and
   `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md`.

### "Unauthorized / 401 from clients"

`KORRI_SESSIOND_TOKEN` and `KORRI_SESSIOND_TOKEN_FILE` were not readable
when the client tried to call sessiond. The Nix module wires the token
file at `/run/korri-sessiond/token` for both daemon-side and
sharedGroup-readable client paths (see task-011 and
`nix/modules/korri-sessiond.nix`). On a kiosk host, the renderer's
calling process must be in the `korri-server` group; on source-machine
hosts, the shared group is `korri-sessiond-clients`.

### "SSE disconnects mid-launch"

`sessiond-managed-launch-event-observer.ts` reconnects with
bounded backoff. If reconnections exceed the budget, the launch is
treated as failed with `host-unavailable`. The root cause is usually
bun's idle timeout disconnecting a quiet SSE stream — see
`docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md`.

## Protocol evolution rule (task-013)

Five operating principles for evolving the wire contract — documented
at the top of `sessiond-managed-launch-protocol.ts`:

1. **Schemas update before the daemon emits.** Add the optional field
   to client schemas first; deploy the daemon second.
2. **Additive only.** Required fields are forever; deprecate by
   marking optional and leaving in the union.
3. **Optional by default for new fields**, even when the daemon always
   emits them.
4. **Mixed-version deployments are supported** during incident response
   and rollback windows.
5. **Capability flags over schema versioning.** When a daemon-side
   change is gated, encode the daemon's support as a capability flag
   on `SessiondManagedLaunchCapabilities`. The capability is the
   contract; the schema is just the wire shape.

Strict decode (`onExcessProperty: "error"`) is the consumer-side
default; relaxing requires a parallel decoder for the specific call
site, never flipping the global flag.

## Failure-stage vocabulary (task-017)

`ForegroundSessionFailureStage` is the union of failure phases shared
by the in-process owner and the sessiond mapping:

`prepare`, `spawn`, `foreground`, `exit`, `teardown`, `readiness`,
`restore`, `adapter`.

`restore` distinguishes "the post-exit happy-path cleanup adapter
failed" (which is `teardown`) from "the recovery-path restore attempt
failed" (which is `restore`). Sessiond's `failKorriRestore` carries the
human reason in `failureReason` and increments `restoreAttempts`;
`shouldStopAfterRestoreFailure` fires after the configured maximum
(default 3) and signals an unrecoverable state.

## Cross-cutting backlog

Related deferred work that operators should be aware of:

- **task-004** — stop running runtime services as root (sessiond is one of the affected daemons).
- **task-008** — multi-user support (sessiond ownership becomes per-user).
- **task-009** — sessiond 100% contract test coverage (currently blocked on task-037 coverage tooling).
- **task-014** — launcher-anchor session lifecycle (shipped, but no production launcher currently produces `extras`).
- **task-017** — failure semantics (shipped — this section reflects the post-task-017 vocabulary).
- **task-035** — audit `foreground-session-status-snapshot.ts` `recentEvents.state` leak (dead code today; one route-mount away from re-exposure).
- **task-036** — constrain `sessiond.failureReason` on the `app.server.status` wire. **Shipped**: `redactSessiondFailureReason` strips absolute paths and clamps to 256 chars. See `physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md` Consequences section.

## Related documents

- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md` — task-012's design note on why sessiond is the canonical lifecycle source.
- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md` — Phase 4C's kiosk-role rollout rationale.
- `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md` — the SSE-disconnect failure mode operators see most often.
- `korri/shared/library/sessiond-managed-launch-protocol.ts` — schemas and the in-file evolution rule.
- `korri/shared/stream/foreground-session-lifecycle.ts` — failure-stage and busy-rejection vocabulary.

## What this document does NOT cover

- Sessiond's internal state machine details — those are documented at
  `tools/device/sessiond-state.ts` with `KorriSessionState` and its
  helpers. Operators rarely need them.
- The renderer-side gate atom mechanics — those are documented at
  `korri/products/app/features/home/foreground-session-status-layer-live.ts`.
- The full launcher contract (`Launcher`, `LaunchExtras`, `LaunchOptions`)
  — those are documented at `korri/shared/library/launcher.ts` and
  `korri/shared/library/library-services.ts` with the per-field
  rationale.
