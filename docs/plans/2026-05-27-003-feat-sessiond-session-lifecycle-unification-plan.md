---
title: "feat: Route lifecycle: \"session\" launcher-anchor intents through sessiond"
type: feat
status: completed
date: 2026-05-27
origin: docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md
verify_command: "just typecheck && just test-unit && just desktop-smoke && just test-nix"
---

# feat: Route lifecycle: "session" launcher-anchor intents through sessiond

## Summary

Extend the sessiond managed-launch protocol with an additive `lifecycle` + optional `wait` shape so launcher-anchor intents (Steam, browsers, scripts that exit cleanly while leaving a session running) flow through sessiond instead of the runner's in-process supervision branch. After this lands, `tools/device/game-stream-runner.ts` has exactly one code path when sessiond is configured: forward the intent, observe lifecycle events, exit with the child exit code. The runner stops being a second foreground supervisor; sessiond owns every foreground intent class on source-machine hosts.

---

## Problem Frame

Phase 4C left a deliberate seam: `lifecycle: "foreground"` intents route through sessiond, but `lifecycle: "session"` launcher-anchor intents still run on the runner's in-process supervision path (`tools/device/game-stream-runner.ts` lines 480–545). This was the right call for that slice — the managed-launch protocol had no vocabulary for launcher-anchor semantics, and forcing it would have ballooned Phase 4C's scope.

The cost of the seam: two foreground supervisors on the same host. The runner does its own foreground promotion (`repairStreamSurface` after `child-running`), its own wait-monitor spawning, its own anchor-wait, its own terminate plumbing. None of this is observable to sessiond, which means operator status, the `app.server.status` proxy (Phase 4C U8), and the cross-host federation plans all see only half the story when a Steam stream is active. It also keeps the runner in the supervision business — and the runner's tests carry the cost.

Track A (per Phase 4C plan §"Deferred to Follow-Up Work") closes the seam: extend the managed-launch protocol additively, teach sessiond to dispatch session-lifecycle launches, move foreground surface repair into the source-machine role, and reduce the runner to a sessiond client for every intent class.

---

## Requirements

- R1. The sessiond managed-launch wire protocol accepts an optional `lifecycle: "foreground" | "session"` field on the start request (default `"foreground"` for back-compat) and an optional `wait: LaunchSpec` field meaningful only when `lifecycle === "session"`. (origin: F4, R14)
- R2. Sessiond emits new lifecycle event types — `launcher-exited`, `wait-monitor-running`, `wait-monitor-exited`, `session-anchored` — as additive peers to the Phase 4B events. Existing Phase 4B clients ignoring unknown events continue to function. (origin: R17)
- R3. When sessiond receives `lifecycle: "session"` with a `wait` spec: launcher exits cleanly → sessiond emits `launcher-exited`, spawns the wait monitor as the new active child, emits `wait-monitor-running`, awaits its exit, emits `wait-monitor-exited`, then proceeds through the existing restoring → idle-ready terminal sequence. (origin: F4)
- R4. When sessiond receives `lifecycle: "session"` with no `wait` spec: launcher exits cleanly → sessiond emits `launcher-exited` then `session-anchored`, holds the role-foreground state, and waits for an external `/managed-launch/terminate` to proceed through restoring → idle-ready. (origin: F4)
- R5. Foreground surface repair (Gamescope window promotion via `repairStreamSurface`) moves out of `tools/device/game-stream-runner.ts` into the source-machine `SessionRole` via a new `afterChildRunning` hook. The kiosk role implements this hook as a no-op. (origin: R17, R20)
- R6. Termination during a session-lifecycle launch reaps the currently-active process group (launcher OR wait monitor OR none-if-anchored) and transitions to restoring. The Phase 4C process-group reaper (`tools/device/sessiond-gamescope-reaper.ts`) runs once, at the final terminal point. (origin: R19)
- R7. The `tools/device/game-stream-runner.ts` in-process session-anchor and wait-monitor code paths are preserved when `sessiondLauncher` is undefined (unit-test path) but unreachable when `sessiondLauncher` is configured (production source-machine path). Runner forwards `lifecycle` + `wait` to sessiond unchanged. (origin: R20)
- R8. The runner exits with the launch's terminal exit code once both `child-exited` (or `wait-monitor-exited` for session+wait, or `session-anchored` followed by `terminated` for session+no-wait) AND the role's terminal readiness event (`idle-ready` / `home-ready`) have been observed. Sunshine stream lifetime semantics are preserved. (origin: R18)
- R9. The `KORRI_GAME_STREAM_STATUS_PATH` sidecar (Phase 4C U3) gains a coarse `phase: "launching" | "running" | "anchored" | "wait-monitor" | "restoring"` field so the Phase 4C U8 status proxy can surface session-lifecycle state to operators. (origin: AE7)
- R10. Phase 4B kiosk hosts are unchanged: kiosk clients never set `lifecycle` (default `"foreground"`), never set `wait`, and never observe the new session-lifecycle events. Kiosk lifecycle tests from Phase 4B continue to pass byte-for-byte. (origin: R17)
- R11. The capability descriptor advertises `sessionLifecycle: true` so the Korri server / runner can detect support before issuing `lifecycle: "session"` intents to a sessiond instance. (origin: R17)
- R12. Strict decoders (`onExcessProperty: "error"`) on both ends prevent silent acceptance of malformed payloads from rolling deployments. (origin: R17)

**Origin actors:** A1 (Korri runtime kiosk supervisor / sessiond), A2 (cloud / streaming host operator), A3 (Korri device user)
**Origin flows:** F4 (host receives a streaming game-launch request and brings up the foreground app)
**Origin acceptance examples:** AE2 (host preempts a foreground app for a fresh stream launch), AE7 (operator observes lifecycle from outside the device)

---

## Scope Boundaries

- This plan does not redesign the trusted launch-intent file contract (`tools/device/game-stream-launch-intent.ts`). Intent enqueue, claim, requeue, completion, and quarantine semantics stay verbatim.
- This plan does not move Korri server's `app.server.stream.prepare` away from the file-mediated handoff. The runner remains the single sessiond client; the open R19/R20 server-direct question stays deferred (Phase 4C §"Deferred to Follow-Up Work").
- This plan does not change Sunshine's NixOS app declaration shape or the runner-as-Sunshine-app wrapper script.
- This plan does not retire `tools/device/game-stream-runner.ts`'s in-process supervision branches; it preserves them for the `sessiondLauncher: undefined` test path and only routes around them when sessiond is configured.
- This plan does not modify the Phase 4C process-group reaper signal sequence. It only ensures the reaper runs at the correct *moment* relative to the new event sequence.
- This plan does not introduce a new mode literal on the wire (`mode: "anchored"` is intentionally not added). The state machine reuses `game` for both running and anchored sub-phases; finer-grained phase reporting is sidecar-only.
- This plan does not change kiosk role behavior. The kiosk path through sessiond remains identical to Phase 4B; the new role hook is a no-op there.

### Deferred to Follow-Up Work

- Server-direct sessiond entry from `app.server.stream.prepare` (open R19/R20).
- Migrating ROCKNIX kiosk hosts from the `/storage`-script sessiond install to the NixOS `korri-sessiond` module.
- Retiring the `KORRI_GAME_STREAM_STATUS_PATH` sidecar once the `app.server.status` sessiond proxy is the only consumer.
- Surfacing session sub-phase (`anchored` / `wait-monitor`) up through `app.server.status` (the sidecar carries it after this plan; the RPC proxy can read it in a follow-up).
- Adapter-specific foreground repair beyond Gamescope (direct-KMS, non-Sway compositors).
- Cross-host operator status surface (remote Korri client observing source-machine sessiond).

---

## Context & Research

### Relevant Code and Patterns

- `tools/device/game-stream-runner.ts` — the surface this plan reduces. Today the lifecycle: "session" branch at lines 480–545 owns: wait-monitor spawning, anchor-without-wait `waitForStopRequest()`, the `isLauncherAnchor` exit-code-classification override, and the `shouldDelayIntentCompletion` claim-completion ordering. Track A moves the first three into sessiond; the claim-completion ordering stays in the runner (it talks to the trusted-intent file, not sessiond).
- `tools/device/game-stream-runner.ts` lines 392–474 — foreground surface repair (`repairStreamSurface`). This is the block that moves into the source-machine `SessionRole.afterChildRunning`.
- `tools/device/game-stream-launch-intent.ts` — `GameStreamLaunchLifecycle = "foreground" | "session"` and the `wait?: LaunchSpec` field. These are the existing shapes the protocol additions mirror.
- `korri/shared/library/sessiond-managed-launch-protocol.ts` — additive protocol home. `SessiondManagedLaunchStartRequest` gains optional `lifecycle` and `wait`; `SessiondManagedLaunchEventType` gains four peers; `SessiondManagedLaunchCapabilities` gains `sessionLifecycle: true`. Strict decoders already enforce `onExcessProperty: "error"`.
- `korri/shared/library/session-launcher.ts` — the Korri server → sessiond HTTP client. Phase 4C already taught it about additive event types and readiness-mode peers; Track A extends the start-request encoder and the event observer's terminal classification.
- `tools/device/sessiond.ts` — `runManagedLaunch` (lines 285–388) is the dispatch path. Track A adds a lifecycle branch after `child-running` and before the existing `child-exited` / `restoring` / terminal-readiness sequence. The `activeManagedLaunch.terminate` / `terminateNow` / `processGroupId` fields are already mutable and are the right hook point for wait-monitor swap-in.
- `tools/device/sessiond-role.ts` — `SessionRole` interface. Track A adds `afterChildRunning(spec)` as a new optional-but-defaulted method, mirroring `beforeChildLaunch` / `restoreIdleAfterLaunch` shapes.
- `tools/device/sessiond-source-machine.ts` — the source-machine role implementation. Receives the foreground surface repair logic that lives in the runner today.
- `tools/device/sessiond-status-sidecar.ts` — Phase 4C-introduced sidecar. Gains a `phase` field that distinguishes launcher-running from wait-monitor-running from anchored, so AE7's "operator observes from outside the device" requirement survives the session-lifecycle generalization.
- `tools/device/sessiond-gamescope-reaper.ts` — Phase 4C process-group reaper. No code changes; only the call-site sequencing changes.
- `tools/device/game-stream-fullscreen.ts` — `repairStreamSurface` and related Gamescope primitives. These move *consumer* (runner → role), not implementation.

### Institutional Learnings

- `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md` — foreground promotion is owned by the session, not the launch wrapper. Confirms that moving `repairStreamSurface` out of the runner and into the role is the correct boundary.
- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md` — the runner is one-shot and exits with its child. Track A preserves this property: the runner still exits with the captured exit code after observing terminal readiness, even though "the child" can now mean launcher OR wait monitor OR anchored.
- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md` — runner is fail-closed and Sunshine-stream-bound. The session-anchor case in particular hinges on Sunshine's stream lifetime driving the runner SIGTERM → sessiond `/terminate` chain. Track A keeps this chain intact; the runner stays bound to Sunshine.
- `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md` — three invariants survive any sessiond protocol extension: suspend home/idle reconciliation while a child owns the screen, restore from a clean state, fail closed when sessiond is configured but unreachable. The session-anchored state in particular must respect (1) — sessiond stays in `game` mode while anchored, *not* `home`.
- `docs/solutions/architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md` — supports treating "what counts as a terminal child" as a role-aware leaf without renaming the orchestration core.

### External References

- None. Local pattern coverage is complete: Phase 4C established the additive-only protocol discipline, the strict-decoder pattern, the SessionRole injectable, and the process-group reaper. Track A applies these patterns without inventing new ones.

---

## Key Technical Decisions

- **Additive wire-protocol extension, not a v2.** `SessiondManagedLaunchStartRequest` gains optional `lifecycle` and `wait` fields (default `lifecycle: "foreground"`, no wait). `SessiondManagedLaunchEventType` gains four peer literals: `launcher-exited`, `wait-monitor-running`, `wait-monitor-exited`, `session-anchored`. Capability descriptor gains `sessionLifecycle: true`. Rationale: matches the Phase 4B / Phase 4C additive discipline; Phase 4B kiosk clients reading status or events keep working without code changes; strict decoders catch any malformed payload from rolling deployments. No `schemaVersion` bump.
- **`child-exited` retains "terminal child" semantics; `launcher-exited` is the new non-terminal exit.** Rather than reusing `child-exited` for the lifecycle: "session" launcher exit (which would change its semantics for Phase 4B clients), introduce `launcher-exited` as a distinct event. Clients can treat it as informational; the terminal child-exit signal remains either `child-exited` (foreground) or `wait-monitor-exited` (session+wait) or `terminated` after `session-anchored` (session+anchor). Rationale: preserves Phase 4B client semantics byte-for-byte (R10); makes the protocol self-describing instead of context-dependent.
- **No `mode: "anchored"` on the wire.** The state machine reuses `mode: "game"` while a launch is anchored (no live child but role-foreground still held). Sub-phase observability goes into the sidecar's new `phase` field, not the protocol mode. Rationale: protocol modes are coarse lifecycle signals consumed by clients (kiosk renderer, runner, status proxy); sub-phases are operator diagnostics that change shape more often. Keeping them separate avoids breaking the protocol every time we want a new observability cut.
- **`afterChildRunning(spec)` is a new SessionRole hook, not an inline branch in `runManagedLaunch`.** Foreground surface repair is role-specific (gamescope/Sway today; could be direct-KMS or non-Sway later) and belongs behind the role injectable. Kiosk implements it as a no-op. Source-machine implements it by calling `repairStreamSurface` (moved verbatim from the runner). Rationale: same pattern as `beforeChildLaunch` / `restoreIdleAfterLaunch`; keeps `createKorriSessiondCore` role-agnostic.
- **Wait-monitor reuses the same launcher injectable as the primary child.** `tools/device/sessiond.ts` already calls `launcher.spawn(spec)` for the primary child and tracks the result's `processGroupId` / `terminate` / `terminateNow` on `activeManagedLaunch`. Spawning the wait monitor uses the same call and overwrites those fields, so the existing reaper and terminate plumbing work unchanged. Rationale: minimum new surface area; the wait monitor is just "the next child," not a new launcher abstraction.
- **The reaper runs once, at the final terminal point.** Phase 4C runs `gamescope-reaper` between `child-exited` and `restoring`. Track A defers the reap to *after* the lifecycle's actual terminal exit — `wait-monitor-exited` for session+wait, `terminated`-after-`session-anchored` for session+anchor. Rationale: the wait monitor may legitimately want the launcher's Gamescope window alive (that's the whole point of an anchor); reaping after the launcher exits would defeat the purpose.
- **Anchor termination is driven by an external `/managed-launch/terminate` request.** In session+anchor mode, sessiond emits `session-anchored` and awaits a terminate request. The runner — still bound to Sunshine's stream lifetime — sends the terminate when Sunshine closes the stream. Rationale: preserves the existing runner ↔ Sunshine ↔ device-end-of-stream contract without inventing a new "anchor expiry" signal. The runner's existing `waitForStopRequest()` becomes a `/managed-launch/terminate` call.
- **Runner preserves its in-process branches when `sessiondLauncher` is undefined.** Unit tests for the runner (`tools/device/game-stream-runner.test.ts`) exercise the in-process supervision path directly. Track A leaves those branches in place for the `sessiondLauncher: undefined` case; the production source-machine path always has sessiond configured. Rationale: avoids destabilizing 1000+ LOC of runner tests; cleanup is a separate follow-up once kiosk hosts migrate to NixOS sessiond.
- **No `services.korri.sessiond.sessionLifecycle` Nix option.** Capability is always-on once sessiond ships this version; clients gate on the capability descriptor, not a Nix option. Rationale: feature flags in Nix add ops surface area; the protocol already negotiates capability per-connection.
- **Status sidecar phase field is the operator's window into session sub-phases.** Today the sidecar reports the coarse mode. Track A adds a `phase` discriminator distinguishing `running` (primary child), `wait-monitor` (wait monitor active), `anchored` (no live child, role-foreground held). Rationale: AE7 requires operators to observe lifecycle from outside the device; without a sub-phase signal, anchored launches look indistinguishable from running launches in the status payload.

---

## Open Questions

### Resolved During Planning

- **Should the launcher exit terminate the launch, then a new launch start the wait monitor?** No — both the launcher and the wait monitor are phases of *one* launch with one `launchId`. Treating them as separate launches would fragment the lifecycle event stream and complicate the SSE replay, terminate routing, and status fields. Sessiond carries the launch through both phases under one identity.
- **How does sessiond know the launcher exited "cleanly" vs "failed" under lifecycle: "session"?** Same as today: exit code 0 + no terminate request in flight. On non-zero exit OR terminate-in-flight, sessiond treats it as `child-exited` (terminal-bearing) and proceeds straight to `restoring`, skipping the wait-monitor / anchor branch. Mirrors the runner's existing behavior at lines 488–490 (`exitCode === 0 && !stopRequested`).
- **What if the wait monitor fails to spawn?** Sessiond logs the failure and falls through to the anchor branch (emit `session-anchored`, wait for terminate). Mirrors the runner's existing graceful degradation at lines 491–502.
- **Does the foreground surface repair fire on the wait monitor too?** No. Surface repair is a one-shot pre-game gate; once the launcher is running with a promoted surface, the wait monitor is just a sleep loop and has no surface of its own. `afterChildRunning` runs once, after the *primary* child reaches `child-running`. Wait-monitor spawn does not re-trigger it.
- **What state does sessiond report during anchor?** `mode: "game"` on the protocol (no new mode literal). `phase: "anchored"` on the status sidecar (operator-facing diagnostic). Active launch identity stays populated until terminate triggers restoring.
- **Does terminate during anchor need to kill anything?** No — by definition, anchor means "launcher exited cleanly, no live child." Terminate just transitions the state machine: emit `terminated`, then `restoring`, then `restoreIdleAfterLaunch`, then `idle-ready`. The reaper still runs (idempotent on an empty PG).
- **How does the runner identify "terminal" given the new event types?** The runner waits for the role's terminal readiness event (`idle-ready` / `home-ready`) AND records the most-recent child exit (`child-exited` for foreground, `wait-monitor-exited` for session+wait, or the implicit exit-code-0 launcher-exit captured by `launcher-exited` for session+anchor). Same `await both` pattern Phase 4C U5 established.
- **Does the federation roadmap care about the new event types?** Yes — but additively. Federation peers that subscribe to lifecycle events will see the new types; they can ignore them safely (Phase 4B-style forward-compat reading) or display them. No federation work required for this plan.

### Deferred to Implementation

- Exact field name on the status sidecar — `phase` vs `subPhase` vs `lifecycle.phase`. Settled at U7 file-write time; protocol does not depend on it.
- Whether `session-anchored` carries a `readiness` payload for symmetry with `idle-ready` / `home-ready`. Probably yes (`readiness: { status: "ok", evidence: "launcher exited; anchor holding" }`), confirmed at U4 implementation.
- The Bun spawn return-value shape for the wait monitor — confirmed by re-using the existing `launcher.spawn(spec)` path at U4 implementation time.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Lifecycle event sequences after this plan lands

```
foreground (Phase 4B + 4C, unchanged):
  launch-accepted → renderer-stopped? → child-running → child-exited
                  → restoring → idle-ready | home-ready

session + wait (NEW):
  launch-accepted → child-running → launcher-exited
                  → wait-monitor-running → wait-monitor-exited
                  → restoring → idle-ready

session + anchor (NEW):
  launch-accepted → child-running → launcher-exited → session-anchored
                  → [external /managed-launch/terminate]
                  → terminated → restoring → idle-ready

session + launcher-failed (graceful degradation, NEW):
  launch-accepted → child-running → child-exited (non-zero)
                  → restoring → idle-ready
  (skips launcher-exited / wait-monitor / anchored — terminal-bearing
  child-exited preserves Phase 4B semantics)
```

### `runManagedLaunch` control flow shape (sessiond.ts)

```
beforeChildLaunch
  emit renderer-stopped (kiosk only)
  state ← game-running
spawn primary child
  emit child-running
  afterChildRunning(spec)    ← NEW: source-machine repairs surface here
await primary child exit
IF lifecycle == "session" AND exitCode == 0 AND no terminate in flight:
  emit launcher-exited
  IF wait spec provided:
    spawn wait monitor (reuse activeManagedLaunch fields)
    emit wait-monitor-running
    await wait monitor exit
    emit wait-monitor-exited
  ELSE:
    emit session-anchored
    await terminate request
    emit terminated
ELSE:
  emit child-exited (terminal)
state ← restoring
emit restoring
reaper(pgid)
restoreIdleAfterLaunch
emit role.idleReadyEventName
```

### SessionRole.afterChildRunning hook shape

```
interface SessionRole {
  /* existing methods */
  afterChildRunning(spec: LaunchSpec): Promise<void>
  /* kiosk: no-op
     source-machine: repairStreamSurface, log on failure, throw on
     unrecoverable so runManagedLaunch can fail the launch */
}
```

---

## Implementation Units

### U1. Additive protocol extension (`lifecycle`, `wait`, four new events, `sessionLifecycle` capability)

**Goal:** Extend `SessiondManagedLaunchStartRequest`, `SessiondManagedLaunchEventType`, and `SessiondManagedLaunchCapabilities` additively so the wire protocol can carry session-lifecycle launches. No behavioral change in this unit; just schema + decoders.

**Requirements:** R1, R2, R10, R11, R12

**Dependencies:** None.

**Files:**
- Modify: `korri/shared/library/sessiond-managed-launch-protocol.ts`
- Test: `korri/shared/library/sessiond-managed-launch-protocol.test.ts`

**Approach:**
- Add `lifecycle: Schema.optional(Schema.Literals(["foreground", "session"]))` and `wait: Schema.optional(LaunchSpec)` to `SessiondManagedLaunchStartRequest`. Default semantics live in sessiond (`lifecycle ?? "foreground"`).
- Add four new literals to `SessiondManagedLaunchEventType`: `"launcher-exited"`, `"wait-monitor-running"`, `"wait-monitor-exited"`, `"session-anchored"`.
- Add `sessionLifecycle: Schema.Boolean` to `SessiondManagedLaunchCapabilities`.
- Update the `TERMINAL_READINESS_EVENT_TYPES` and `READINESS_GATE_BY_EVENT` constants only if a readiness-gate equivalent is needed for `session-anchored` (it is not — the gate is `idle-ready` after the anchor's terminate, same as foreground).
- Keep `STRICT_DECODE = { onExcessProperty: "error" }`.

**Execution note:** Test-first. Schema additions are exactly the kind of change where a failing decode pinpoints intent before implementation.

**Patterns to follow:** Phase 4C U1 (`dbe7f26 feat(library): add idle-ready and idle mode to sessiond protocol`) — same additive-peer + strict-decoder shape. Read it before writing this unit.

**Test scenarios:**
- *Happy path.* `decodeSessiondManagedLaunchStartRequest` accepts `{ spec, lifecycle: "session", wait: <launchSpec> }`.
- *Happy path / back-compat.* `decodeSessiondManagedLaunchStartRequest` accepts `{ spec }` with no `lifecycle` and no `wait` (Phase 4B kiosk client shape).
- *Happy path.* `decodeSessiondManagedLaunchEvent` accepts each of the four new event types.
- *Happy path.* `decodeSessiondManagedLaunchStatus` accepts `capabilities.sessionLifecycle: true`.
- *Edge case.* `decodeSessiondManagedLaunchStartRequest` rejects `lifecycle: "background"` (unknown literal) with a typed decode error.
- *Edge case.* `decodeSessiondManagedLaunchStartRequest` rejects `{ spec, lifecycle: "foreground", wait: <spec> }`? — *Decision deferred to implementation.* Wait-with-foreground is semantically meaningless but harmless; if cheap to reject in schema, do so; otherwise ignore at runtime. Document the chosen path in the unit.
- *Error path.* Strict decode rejects an unknown event type (e.g., `"surprise-event"`) so a forward-compat reader sees the protocol violation, not a silent acceptance.
- *Covers R10.* A serialized Phase 4B status payload (`{ schemaVersion: 1, mode: "home", capabilities: { managedLaunch, lifecycleEvents, perLaunchTermination }, restoreAttempts: 0 }`) without `sessionLifecycle` decodes successfully — Phase 4B clients are not broken.

**Verification:**
- `bun test korri/shared/library/sessiond-managed-launch-protocol.test.ts` passes.
- Phase 4C tests in the same file (`idle-ready`, `idle` mode, `TERMINAL_READINESS_EVENT_TYPES`) still pass.
- `just typecheck` clean — all consumers of these types build without changes (the additions are optional / additive).

---

### U2. Session-launcher client forwards `lifecycle` + `wait`, observes new event types

**Goal:** Teach `korri/shared/library/session-launcher.ts` to accept `lifecycle` and `wait` on its public launch API, forward them in the HTTP start request, and treat `wait-monitor-exited` as a child-exit terminal signal in its event observer. `launcher-exited`, `wait-monitor-running`, and `session-anchored` are observed but informational.

**Requirements:** R1, R2, R8, R11

**Dependencies:** U1.

**Files:**
- Modify: `korri/shared/library/session-launcher.ts`
- Test: `korri/shared/library/session-launcher.test.ts`

**Approach:**
- Extend the launch options type with optional `lifecycle: "foreground" | "session"` and `wait: LaunchSpec` fields, default `lifecycle: "foreground"`.
- Encode both into the HTTP `/managed-launch/start` request body.
- In the SSE event observer, augment the terminal-detection logic to also resolve on `wait-monitor-exited` (with the exit code from the event's `terminal` field) in addition to the existing `child-exited`.
- Observe `launcher-exited`, `wait-monitor-running`, and `session-anchored` as informational — log them, expose them through the event callback, but do not treat them as terminal.
- Add a capability check (`capabilities.sessionLifecycle === true`) gate when a caller passes `lifecycle: "session"`. If the server lacks the capability, fail with the typed `host-unavailable` failure kind (same shape Phase 4C established for unsupported managed sessiond capability).

**Execution note:** Test-first. The event-observer terminal-detection logic is the highest-risk change.

**Patterns to follow:** `korri/shared/library/session-launcher.ts` Phase 4C extensions for `idle-ready` and the readiness-mode peers — same `additive observe / treat as terminal-equivalent` shape.

**Test scenarios:**
- *Happy path / foreground.* Calling with `lifecycle: "foreground"` (or unset) produces a start request without a `lifecycle` field (or with `"foreground"`), matching Phase 4B byte-for-byte.
- *Happy path / session+wait.* Calling with `lifecycle: "session"` + `wait` produces a start request carrying both fields; events `launcher-exited` then `wait-monitor-running` then `wait-monitor-exited` resolve the launch with the wait-monitor exit code.
- *Happy path / session+anchor.* Calling with `lifecycle: "session"` no `wait` observes `launcher-exited` then `session-anchored`; the launch promise stays pending until `terminated` + `idle-ready` arrive.
- *Edge case.* When the server's status capability descriptor reports `sessionLifecycle: false` and the caller passes `lifecycle: "session"`, the launcher fails fast with `host-unavailable` (diagnostic message names the missing capability).
- *Edge case.* When `lifecycle: "session"` + `wait` and the launcher emits `child-exited` with a non-zero code (graceful degradation, no `launcher-exited`), the launch resolves with that exit code — wait-monitor branch never fires.
- *Error path.* Sessiond returns a `failed` start response under `lifecycle: "session"`; the launch fails with the typed failure kind from the response.
- *Integration.* End-to-end SSE replay (using the existing test rig) confirms event ordering: `launch-accepted → child-running → launcher-exited → wait-monitor-running → wait-monitor-exited → restoring → idle-ready` resolves the launch exactly once.
- *Covers R10.* A Phase 4B-shaped SSE stream (no `launcher-exited`, no `wait-monitor-*`, just `child-running → child-exited → restoring → home-ready`) still resolves the launch correctly when `lifecycle` is unset — kiosk path untouched.

**Verification:**
- `bun test korri/shared/library/session-launcher.test.ts` passes; Phase 4C tests in the same file still pass.
- `just typecheck` clean.

---

### U3. `SessionRole.afterChildRunning` hook + kiosk no-op

**Goal:** Introduce the `afterChildRunning(spec: LaunchSpec)` method on the `SessionRole` interface, implement it as a no-op on the kiosk role, and make it the documented integration point for foreground surface repair.

**Requirements:** R5, R10

**Dependencies:** None (orthogonal to U1/U2).

**Files:**
- Modify: `tools/device/sessiond-role.ts`
- Modify: `tools/device/sessiond-role.test.ts`

**Approach:**
- Add `afterChildRunning(spec: LaunchSpec): Promise<void>` to the `SessionRole` interface, alongside `beforeChildLaunch` / `restoreIdleAfterLaunch`. Document the contract: called exactly once per managed launch, after the primary child is observed running, before the launch's lifecycle proceeds past `child-running`.
- Implement on `createKioskSessionRole` as a no-op (kiosk has no foreground surface to repair — Electrobun owns the renderer; gamescope isn't in the path).
- Document via inline comment that source-machine implements this in U4 (forward reference).

**Execution note:** none — interface + no-op only; pair tightly with U4 and U5 for behavior validation.

**Patterns to follow:** Existing kiosk role methods in `tools/device/sessiond-role.ts` (`beforeChildLaunch`, `restoreIdleAfterLaunch`).

**Test scenarios:**
- *Happy path.* Kiosk role's `afterChildRunning(spec)` resolves without throwing and without observable side effects.
- *Covers R5.* `SessionRole` interface includes `afterChildRunning` as a required method (type-level test).

**Verification:**
- `bun test tools/device/sessiond-role.test.ts` passes.
- `just typecheck` clean.

---

### U4. Sessiond core: lifecycle-aware dispatch (launcher-exited → wait monitor OR anchor → terminate)

**Goal:** Extend `runManagedLaunch` in `tools/device/sessiond.ts` to handle `lifecycle: "session"` start requests with the launcher-exit / wait-monitor / anchor dispatch described in the High-Level Technical Design. Continue emitting the existing terminal events (`restoring`, role-specific terminal readiness) at the end of every lifecycle path.

**Requirements:** R2, R3, R4, R6, R7, R8, R11

**Dependencies:** U1 (protocol), U3 (afterChildRunning hook).

**Files:**
- Modify: `tools/device/sessiond.ts`
- Modify: `tools/device/sessiond.test.ts`

**Approach:**
- Plumb `lifecycle` and `wait` through `startManagedLaunch` → `runManagedLaunch` (additional fields on the internal start record; defaults `lifecycle: "foreground"`, no wait).
- After `child-running` is emitted, call `await role.afterChildRunning(spec)`. On throw: treat as a launch failure (emit `child-exited` with `failureKind: "host-unavailable"`, message from the error, then proceed through restoring).
- After the primary child exits, branch on `(lifecycle === "session" && exitCode === 0 && !cancelInFlight)`:
  - Emit `launcher-exited` (with the launcher's `terminal` payload).
  - If `wait` is set, attempt `launcher.spawn(wait)`. Overwrite `activeManagedLaunch.terminate`, `terminateNow`, `processGroupId` from the wait monitor's session. Emit `wait-monitor-running`. Await the wait monitor's result; emit `wait-monitor-exited` carrying its terminal payload. Proceed to the existing restoring path.
  - If `wait` is unset OR `launcher.spawn(wait)` throws (graceful degradation), emit `session-anchored` (`readiness: { status: "ok", evidence: "launcher exited; anchor holding" }`). Set `activeManagedLaunch` to a "no live child" shape (no PG to terminate). Await a terminate request via the existing `cancelRequested` mechanism. When terminate arrives, emit `terminated`. Proceed to restoring.
- Else (lifecycle === "foreground" OR non-zero exit OR terminate-in-flight under session lifecycle): emit `child-exited` (current Phase 4B behavior). Proceed to restoring.
- The reaper runs once per managed launch, after the lifecycle's final exit and before `restoreIdleAfterLaunch` — same call site as Phase 4C, just at a potentially-later moment.
- Advertise `capabilities.sessionLifecycle: true` in the status response.
- Status mode stays `game` throughout (launcher running, wait monitor running, anchored). Restoring → idle/home as today.
- Emit the status sidecar on each phase transition (U7 reads this).

**Execution note:** Test-first. Each new branch is a high-risk change in the supervisor's hot path.

**Patterns to follow:** Existing `runManagedLaunch` structure in `tools/device/sessiond.ts` lines 285–388. Existing `activeManagedLaunch.terminate` swap-in pattern.

**Test scenarios:**
- *Happy path / foreground.* `lifecycle: "foreground"` (or default) produces the exact Phase 4B event sequence: `launch-accepted → [renderer-stopped] → child-running → child-exited → restoring → idle-ready|home-ready`. No new events appear.
- *Happy path / session+wait.* `lifecycle: "session"` + `wait`, launcher exits 0, wait monitor exits 0: full sequence `launch-accepted → child-running → launcher-exited → wait-monitor-running → wait-monitor-exited → restoring → idle-ready`.
- *Happy path / session+anchor.* `lifecycle: "session"` + no wait, launcher exits 0, external terminate arrives 50ms later: full sequence `launch-accepted → child-running → launcher-exited → session-anchored → terminated → restoring → idle-ready`.
- *Edge case / session+wait spawn failure.* Wait monitor `launcher.spawn(wait)` throws: sequence degrades to anchored — `launch-accepted → child-running → launcher-exited → session-anchored → terminated → restoring → idle-ready`.
- *Edge case / session+wait wait-monitor non-zero exit.* Sequence completes with the wait monitor's non-zero exit code in `wait-monitor-exited.terminal`; lifecycle still proceeds through restoring to terminal readiness.
- *Edge case / session+wait launcher fails.* Launcher exits with non-zero code under `lifecycle: "session"`: sequence falls back to `child-exited` (terminal-bearing) → `restoring` → `idle-ready`. No launcher-exited / wait-monitor / anchored events emitted.
- *Edge case / terminate during launcher.* Terminate arrives while primary child is running under `lifecycle: "session"`: sequence emits `child-exited` (with `signal: "SIGTERM"`) → `restoring` → `idle-ready`. No launcher-exited / wait-monitor events.
- *Edge case / terminate during wait-monitor.* Terminate during wait monitor: wait monitor PG is signaled via the existing terminate plumbing, `wait-monitor-exited` carries the SIGTERM terminal, then restoring proceeds.
- *Error path.* `role.afterChildRunning` throws (e.g., gamescope window never appears): launch ends as a failure — `child-running → child-exited (failureKind: host-unavailable, stderrTail: error message) → restoring → idle-ready|home-ready`. The role's restoration still runs.
- *Integration.* `activeManagedLaunch.terminate` and `processGroupId` correctly point to the wait monitor's session after the swap-in (verified via the existing terminate-routing test pattern).
- *Integration.* The reaper runs exactly once per managed launch, with the *final* PG (wait monitor's for session+wait, primary child's for everything else), and never during the anchored state's pre-terminate window.
- *Covers AE2.* A second launch issued while a session-anchored launch is active is rejected with `session-busy` (current Phase 4C preflight semantics survive untouched).
- *Covers AE7.* `capabilities.sessionLifecycle === true` in the `/managed-launch/status` response after this lands.
- *Covers R10.* All Phase 4B kiosk lifecycle tests still pass without modification.

**Verification:**
- `bun test tools/device/sessiond.test.ts` passes. Phase 4B + Phase 4C tests pass without modification.
- Manual smoke not required at this layer — the integration smoke comes in U6.

---

### U5. Source-machine role implements `afterChildRunning` (foreground surface repair)

**Goal:** Move the foreground Gamescope surface repair (`repairStreamSurface` and its supporting state from `tools/device/game-stream-runner.ts` lines 392–474) into the source-machine role's `afterChildRunning` implementation.

**Requirements:** R5

**Dependencies:** U3, U4.

**Files:**
- Modify: `tools/device/sessiond-source-machine.ts`
- Modify: `tools/device/sessiond-source-machine.test.ts`

**Approach:**
- Add `afterChildRunning(spec)` to the source-machine role. Implementation calls `repairStreamSurface` with the same options shape the runner uses today (mirrored from `RepairStreamSurfaceOptions`).
- Expose the repair options as a constructor argument on the role factory (`createSourceMachineSessionRole`), so the NixOS module / test harness can override the gamescope selector / timeout.
- On repair failure, log structured error and throw — `runManagedLaunch` (U4) maps the throw to a launch failure.
- Add a `markGameStreamFullscreenRepaired` equivalent only if the sidecar's `phase` field needs `running` vs `running-repaired` granularity. Default: no — single `running` phase is fine; the protocol's `child-running` event already signals the gate.

**Patterns to follow:**
- `tools/device/game-stream-runner.ts` lines 392–474 — the source.
- Phase 4C `tools/device/sessiond-source-machine.ts` shape for the role injectable.

**Test scenarios:**
- *Happy path.* `afterChildRunning(spec)` resolves after a successful surface repair (test the role with a fake `repairStreamSurface` injectable).
- *Error path.* Surface repair throws (selector never appears within timeout): `afterChildRunning` propagates the throw; downstream sessiond emits `child-exited` with the failure (covered in U4 integration test).
- *Edge case.* `afterChildRunning` is called with a `spec` that has no gamescope selector — the role still operates safely (repair is a no-op or skipped per configuration).
- *Edge case.* `afterChildRunning` is called when the source-machine role is in `idle` mode (defensive): logs warning and proceeds — surface repair is idempotent on idle.
- *Covers R5.* Foreground surface repair never runs in `tools/device/game-stream-runner.ts` when `sessiondLauncher` is configured (verified in U6 test).

**Verification:**
- `bun test tools/device/sessiond-source-machine.test.ts` passes.
- `bun test tools/device/sessiond-role.test.ts` continues to pass.

---

### U6. Runner forwards `lifecycle` + `wait` to sessiond; in-process branches are unreachable when sessiond is configured

**Goal:** Update `tools/device/game-stream-runner.ts` so that, when `sessiondLauncher` is configured, every launch intent (foreground AND session) is routed through sessiond with `lifecycle` and `wait` forwarded. Preserve the in-process branches verbatim for `sessiondLauncher: undefined` (test) callers.

**Requirements:** R5, R7, R8, R10

**Dependencies:** U2, U4, U5.

**Files:**
- Modify: `tools/device/game-stream-runner.ts`
- Modify: `tools/device/game-stream-runner.test.ts`

**Approach:**
- In the `sessiondLauncher !== undefined` branch (Phase 4C U5 introduced this at line ~438), drop the `&& lifecycle === "foreground"` predicate. Both lifecycles go through sessiond.
- Forward `launchClaim.intent.lifecycle` and `launchClaim.intent.wait` into the sessiond start request via the U2-extended client.
- Drop the runner's foreground surface repair block (lines 392–474, "if (fullscreen) { ... repairStreamSurface ... }") when `sessiondLauncher` is configured — the role does it now. Preserve the block when `sessiondLauncher === undefined`.
- Drop the runner's session-anchor / wait-monitor block (lines 480–545, "if (lifecycle === 'session' && exitCode === 0 && !stopRequested) { ... wait monitor / waitForStopRequest ... }") when `sessiondLauncher` is configured. Preserve when undefined.
- For session+anchor launches under sessiond: when the runner observes `session-anchored`, transition into `waitForStopRequest()` (same Sunshine-driven stop signal as today); on stop, send `/managed-launch/terminate`; await the rest of the lifecycle (`terminated → restoring → idle-ready`).
- For session+wait launches under sessiond: the runner just observes the lifecycle stream — no local supervision.
- The runner's `markGameStreamFullscreenRepaired` state transition (used today for sidecar/status) becomes either: (a) keyed off the `child-running` event when sessiond is in play, OR (b) dropped entirely if the U7 sidecar phase field obviates it. Decision deferred to implementation.

**Execution note:** Test-first. The session-anchor / wait-monitor logic is the runner's most-tested branch; characterization tests before changes.

**Patterns to follow:**
- Phase 4C U5 (`8cf3b19 feat(device): route foreground game-stream intents through sessiond`) — the foreground-only routing pattern this unit generalizes.
- `tools/device/game-stream-runner.ts` lines 540–562 — existing `isLauncherAnchor` exit-code-classification logic. Confirm it stays correct under sessiond routing (likely: yes — the runner now learns the terminal exit code from `wait-monitor-exited` or `terminated` events).

**Test scenarios:**
- *Happy path / foreground.* `sessiondLauncher` configured, `lifecycle: "foreground"`: runner forwards to sessiond exactly as Phase 4C U5 (no regression).
- *Happy path / session+wait.* `sessiondLauncher` configured, `lifecycle: "session"` + `wait`: runner forwards both fields, observes the full session+wait event sequence, exits with the `wait-monitor-exited.terminal.exitCode`.
- *Happy path / session+anchor.* `sessiondLauncher` configured, `lifecycle: "session"` no `wait`: runner forwards, observes `launcher-exited` + `session-anchored`, enters `waitForStopRequest()`, sends `/managed-launch/terminate` on stop, observes `terminated → restoring → idle-ready`, exits 0.
- *Edge case / SIGTERM during session+anchor pre-terminate.* SIGTERM arrives while runner is in `waitForStopRequest()` after `session-anchored`: runner sends terminate, exits cleanly with code 0 (launcher-anchor convention from existing `isLauncherAnchor` classification).
- *Edge case / sessiondLauncher === undefined.* Runner uses the in-process branches unchanged for both `lifecycle: "foreground"` and `lifecycle: "session"` (preserved test coverage; this is the only path the in-process branches are reachable from after this plan).
- *Edge case / sessiond rejects `lifecycle: "session"` (capability gap).* Runner observes the typed `host-unavailable` failure from U2's capability check, fails the launch, requeues the intent.
- *Error path / surface repair fails inside sessiond.* Runner observes `child-running → child-exited (failureKind: host-unavailable)`, requeues with the diagnostic.
- *Integration.* Sunshine SIGTERM → runner sends `/managed-launch/terminate` → sessiond emits `terminated` → restoring → idle-ready → runner exits 0. Stream lifetime contract preserved.
- *Covers R10.* Kiosk runner unit tests untouched; kiosk-host integration tests still pass (kiosk doesn't use this runner, but the test discipline is the same).

**Verification:**
- `bun test tools/device/game-stream-runner.test.ts` passes.
- `just typecheck` clean.
- `just desktop-smoke` passes (no regression — desktop smoke does not exercise sessiond but verifies the runner module still loads cleanly).

---

### U7. Status sidecar gains `phase` field for session sub-states

**Goal:** Extend the Phase 4C-introduced status sidecar (`tools/device/sessiond-status-sidecar.ts`) with a `phase` field that distinguishes `launching`, `running`, `wait-monitor`, `anchored`, and `restoring`. The `app.server.status` proxy reads this in a follow-up; this unit ships the field and the writer.

**Requirements:** R9

**Dependencies:** U4 (sessiond emits the phase transitions).

**Files:**
- Modify: `tools/device/sessiond-status-sidecar.ts`
- Modify: `tools/device/sessiond-status-sidecar.test.ts`

**Approach:**
- Add `phase: "launching" | "running" | "wait-monitor" | "anchored" | "restoring"` to the sidecar's status record (additive optional).
- Sessiond writes the sidecar with the correct phase at each transition (U4 wires the writes).
- Document the field's intended consumer in a header comment: AE7 (operator-visible session lifecycle).

**Test scenarios:**
- *Happy path.* Sidecar records reflect the phase at each transition (test with a fake sessiond emitting the transitions).
- *Edge case.* When sessiond is in `mode: "idle"`/`"home"` (no active launch), `phase` is absent or `"idle"` (decided at impl time).
- *Covers AE7.* A serialized sidecar for a session-anchored launch carries `phase: "anchored"` distinguishable from `phase: "running"`.
- *Covers R10.* Kiosk sidecar paths (no `lifecycle: "session"` ever set) still write the existing fields; `phase` is optional from a reader's perspective.

**Verification:**
- `bun test tools/device/sessiond-status-sidecar.test.ts` passes.

---

## System-Wide Impact

- **Interaction graph:** Touches the runner ↔ sessiond ↔ source-machine role ↔ Sunshine chain. Runner becomes a thinner client; role gains a new hook; sessiond gains a lifecycle branch. The launch-intent file boundary, Sunshine app declaration, and Korri server `app.server.stream.prepare` handler are unchanged.
- **Error propagation:** New failure modes — wait-monitor spawn failure (degrades to anchored), `afterChildRunning` failure (degrades to `child-exited` with `host-unavailable`). Existing failure-kind taxonomy unchanged.
- **State lifecycle risks:** The state machine remains in `game` mode through the entire session-anchor window. If sessiond crashes mid-anchor, on restart it has no live child to recover — `restoreIdleAfterLaunch` runs and the host returns to idle. Need to verify the existing crash-recovery path handles this (likely yes; same shape as a kiosk launcher crashing mid-launch).
- **API surface parity:** `capabilities.sessionLifecycle` is the negotiation handle. Clients without the new shape continue to default to `lifecycle: "foreground"` and never see the new events.
- **Integration coverage:** The runner-to-sessiond Sunshine-stream-lifetime contract is the highest-value integration to characterize. U6 includes integration test scenarios that exercise the SIGTERM-during-anchor path end-to-end.
- **Unchanged invariants:**
  - Launch-intent file format and trust contract (mode 0600, UID-owned, parent-dir 0700).
  - Sunshine NixOS app declaration shape.
  - Korri server `app.server.stream.prepare` handler.
  - Phase 4B kiosk wire protocol (every Phase 4B event sequence still validates).
  - Phase 4C source-machine `restoreIdleAfterLaunch` (idle-blank invariant) — same definition, same enforcement.
  - Process-group reaping discipline (`setsid` + `kill(-pgid)`).
  - The kiosk role's `afterChildRunning` is a no-op — kiosk surface promotion is unchanged.

---

## Phased Delivery

### Phase 1 — Foundational protocol + role hook (no externally observable behavior change)

- U1 protocol additive
- U2 session-launcher client extension
- U3 SessionRole.afterChildRunning hook (kiosk no-op)

Each lands without changing any runtime behavior on either kiosk or source-machine hosts. Phase 4B + Phase 4C tests stay green throughout.

### Phase 2 — Sessiond core + source-machine role behavior

- U4 sessiond lifecycle dispatcher (launcher-exited, wait monitor, anchor)
- U5 source-machine role's `afterChildRunning` (foreground surface repair moves in)

After Phase 2, sessiond is *capable* of supervising session-lifecycle launches end-to-end. The runner has not yet been switched over, so source-machine hosts still go through the runner's in-process branches.

### Phase 3 — Runner integration + status sidecar

- U6 runner forwards lifecycle to sessiond
- U7 status sidecar phase field

After Phase 3, source-machine hosts route every launch class through sessiond. The runner's in-process branches are unreachable in production and only used by unit tests.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Anchored launches leak indefinitely if Sunshine never sends SIGTERM (e.g., the Korri client crashes mid-stream and Sunshine never notices). | Mirrors the existing Phase 4B + Phase 4C foreground risk — Sunshine's stream watchdog tears down the runner on client disconnect. The runner's SIGTERM handler sends `/managed-launch/terminate` immediately. The anchored window is bounded by Sunshine's stream lifetime, which already handles this class. |
| The new `afterChildRunning` hook introduces a window where the role can fail after `child-running` is emitted, surprising clients that assumed `child-running` was a stable signal. | U4 maps an `afterChildRunning` throw to a `child-exited` event with the original child's exit info or a `host-unavailable` failure kind. Clients see a normal lifecycle terminus, just with `failureKind` set. Documented in U4 test scenarios. |
| `wait-monitor-running` swap-in races with an incoming `/managed-launch/terminate`. | `activeManagedLaunch.terminate` / `terminateNow` are updated atomically before `wait-monitor-running` is emitted; the existing `cancelRequested === "force" \| "graceful"` check on the active record handles the race the same way the primary-child spawn does today (line 314 in sessiond.ts). |
| Reaping at the end of a session-anchor (no live child) is a no-op but consumes time. | The reaper signal sequence on an empty PG is bounded; the existing test rig already covers this case. |
| Status sidecar phase field becomes a load-bearing operator dependency before the `app.server.status` proxy reads it. | Phase 3 ships sidecar + writer; the `app.server.status` proxy follow-up can read it. Tooling that already consumes the sidecar gets the new field additively (Phase 4C U3 documented it as optional). |
| Capability negotiation drift — a future sessiond stops advertising `sessionLifecycle` and clients fall back to `foreground`. | The capability descriptor is the single source of truth. U2 fails fast with `host-unavailable` when the caller wants session lifecycle and the server lacks it; no silent fallback path. |
| Removing surface repair from the runner breaks a non-sessiond-configured deploy that was relying on the runner doing it. | The runner preserves the surface-repair block when `sessiondLauncher === undefined` (test-only path in production today). U6 explicitly tests this branch. |

---

## Documentation / Operational Notes

- No Nix module changes — the `korri-sessiond` module shipped in Phase 4C U6 already exposes everything this plan needs. No `sessionLifecycle` Nix option (decision in Key Technical Decisions).
- No `STRATEGY.md` revisions — this plan executes inside an existing strategic track.
- The Phase 4B / Phase 4C kiosk migration story is unchanged. ROCKNIX `/storage`-installed kiosk hosts still ship without the new event types (their sessiond is older; that's fine — kiosk clients never emit `lifecycle: "session"`).
- Update `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md` only if the foreground-policy contract changes — it should not. (Verify at U5 review time.)

---

## Sources & References

- **Origin document:** `docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md` (F4, R14, R17, R18–R20)
- **Antecedent plan:** `docs/plans/2026-05-27-002-feat-foreground-session-source-machine-phase4c-plan.md` (completed) — Track A is its explicit deferred follow-up.
- **Phase 4A plan:** `docs/plans/2026-05-26-011-feat-foreground-session-adapter-rollout-plan.md`
- **Phase 4B plan:** `docs/plans/2026-05-26-012-feat-sessiond-managed-lifecycle-events-plan.md`
- **Key existing surfaces:**
  - `tools/device/game-stream-runner.ts` (lines 392–474 surface repair; lines 480–545 session-anchor / wait monitor)
  - `tools/device/sessiond.ts` (lines 285–388 `runManagedLaunch`)
  - `korri/shared/library/sessiond-managed-launch-protocol.ts`
  - `tools/device/sessiond-role.ts`
  - `tools/device/sessiond-source-machine.ts`
  - `tools/device/sessiond-status-sidecar.ts`
