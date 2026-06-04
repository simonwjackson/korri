---
title: feat: Harden foreground session readiness after stream exit
type: feat
status: completed
date: 2026-05-26
origin: ../../01KSBMG31W82JBVJBJ5TT15MZN-feat-default-gamescope-foreground-launch/requirements.md
verify_command: "just typecheck && just test-unit"
---

# feat: Harden foreground session readiness after stream exit

## Summary

Phase 2 deepens the existing foreground session owner so a Moonlight/Gamescope child exit is no longer enough to return to `IdleReady`. The desktop launch path will remain busy until adapter-provided teardown/readiness checks prove the local child is gone, the launched foreground surface is gone, and a bounded cooldown has elapsed, while compositor and optional Moonlight local-control signals are recorded as evidence.

---

## Problem Frame

Phase 1 established ownership and re-entry rejection, but its exit observer still transitions from child exit to ready immediately. That leaves the original Sobo-class risk only partially addressed: a new launch can begin after the Moonlight process exits but before the compositor/session has actually settled.

---

## Requirements

- R1. Treat child/session exit as necessary but insufficient for desktop foreground-session readiness. (Origin R16; AE6)
- R2. Keep the foreground session lifecycle non-idle through teardown, readiness verification, and cooldown; re-entry during that window continues returning typed `session-busy`. (Origin R14, R15, R16; F2; AE5, AE6)
- R3. Add generic owner hooks for teardown/readiness evidence without making the shared lifecycle contract Moonlight-, Sway-, or Gamescope-specific. (Origin R10, R11, R13, R16)
- R4. For the desktop Moonlight/Gamescope adapter, gate readiness on owned local process/session termination, launched foreground surface disappearance, and bounded cooldown. (Origin R16; AE6)
- R5. Record compositor probe outcomes and optional Moonlight local-control lifecycle evidence as structured readiness evidence, without making Moonlight local-control mandatory in this phase. (Origin R16, R17; AE7)
- R6. Preserve Phase 1 launch behavior, default-on Gamescope behavior, busy response category, and shutdown termination semantics. (Origin R1, R2, R4, R7, R15)
- R7. Preserve terminal status and readiness failure evidence separately so a clean child exit followed by a readiness failure remains diagnosable. (Origin R13, R17; AE7)

**Origin actors:** A2 Player, A3 Foreground/session owner, A4 Launcher adapter, A7 Operator/agent
**Origin flows:** F2 Re-entry while a session is not ready, F3 Moonlight-first remote stream launch
**Origin acceptance examples:** AE5 re-entry rejection, AE6 conservative readiness, AE7 lifecycle evidence

---

## Scope Boundaries

- This phase targets the desktop Moonlight/Gamescope stream launch path first.
- No cloud-gaming/source-machine idle-blank readiness implementation in this phase.
- No broad adapter rollout for every foreground app path.
- No new renderer lifecycle dashboard, launch-button disabled state, or richer public status API.
- No launch queueing or cancel-and-relaunch policy.
- No requirement that Moonlight local-control is enabled or available.
- No attempt to root-cause or fix the native Sway/Gamescope crash class directly; this phase avoids racing re-entry and records evidence.
- No change to default Gamescope policy, wrapping arguments, config cascade, or opt-out semantics.

### Deferred to Follow-Up Work

- Phase 3 lifecycle observability and UI feedback for launch disabled/explained states.
- Cloud-gaming/source-machine readiness where the idle target is a blank graphical session instead of a restored Korri client.
- Escalating compositor stability from recorded evidence to a hard readiness gate after real-device evidence validates the signal.
- Applying the same readiness contract to local app/emulator adapters beyond Moonlight/Gamescope.

---

## Context & Research

### Relevant Code and Patterns

- `korri/shared/stream/foreground-session-lifecycle.ts` already defines `ExitObserved`, `TearingDown`, `VerifyingReady`, `Failed`, `Recovering`, readiness/cleanup failure stages, terminal status, active-session evidence, and ready events.
- `korri/deploy/desktop/foreground-session-owner.ts` owns the Phase 1 state machine and currently releases to idle immediately after `ExitObserved -> TearingDown -> VerifyingReady`.
- `korri/deploy/desktop/launch-bridge.ts` is the desktop Moonlight/Gamescope adapter seam; it already snapshots pre-existing foreground surface IDs before launch and repairs the new foreground surface after spawn.
- `tools/device/game-stream-fullscreen.ts` already contains Sway tree parsing, stream-surface discovery, pre-existing surface ignoring, and foreground repair helpers.
- `korri/deploy/desktop/moonlight-session-runner.ts` exposes managed Moonlight session handles backed by Bun child processes.
- `korri/shared/stream/moonlight-control-protocol.ts` and related Moonlight control artifacts provide optional adapter evidence but should not become the abstraction.
- `tools/device/sessiond.ts` and `tools/device/sessiond-state.ts` show the older supervised session pattern where child exit is followed by explicit restore/reconcile work.

### Institutional Learnings

- `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`: Gamescope is an adapter; the Korri session owns foreground state, restore, recovery, and readiness.
- `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md`: child/app exit is not readiness; the supervisor must restore and verify the session invariant before accepting new work.
- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`: session evidence must be interpreted against a fresh one-shot launch/session, not stale status from prior runs.
- `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md`: verify the real process/session owner rather than relying on broad process cleanup.
- `docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md`: compositor checks require the right Wayland/Sway environment; otherwise readiness probes are blind.

### External References

- External research is not needed; this work is grounded in repo-local lifecycle patterns and device-specific learnings.

---

## Key Technical Decisions

- Extend the existing owner, do not introduce a parallel supervisor: Phase 1 already owns acceptance, busy rejection, active handle termination, and exit observation.
- Add explicit adapter teardown/readiness hooks: lifecycle I/O belongs behind adapter hooks rather than `onStateEntered` test hooks or hard-coded Moonlight/Sway logic inside the generic owner.
- Gate readiness on process gone, launched surface gone, and cooldown elapsed for the desktop Moonlight/Gamescope adapter: these are the concrete Phase 2 signals that directly prevent immediate unsafe re-entry.
- Record compositor probe and Moonlight local-control as evidence-only in this slice: they are useful diagnostics but not yet reliable enough to be universal hard gates.
- Track launched surface identity after foreground repair: readiness must target the actual surface created for the accepted launch, not just the pre-launch ignored surface set.
- Preserve the `session-busy` wire contract: Phase 2 widens the time window for the same category rather than introducing renderer/UI contract churn.
- Preserve terminal and readiness evidence independently: a clean child exit can coexist with a readiness failure such as a lingering surface.
- Use injectable timing and cancellation seams: cooldown and polling must be deterministic in tests and abortable during desktop shutdown.

---

## Open Questions

### Resolved During Planning

- Readiness gates for this phase: managed process/session gone, launched surface gone, and bounded cooldown.
- Evidence-only signals for this phase: compositor probe and optional Moonlight local-control state.
- Public wire contract: keep using `session-busy` during the wider not-ready window.
- Scope: desktop Moonlight/Gamescope first; cloud-gaming/source-machine readiness deferred.
- Owner shape: add adapter readiness hooks rather than relying on `onStateEntered` for behavior.

### Deferred to Implementation

- Exact timeout and cooldown constants: choose conservative defaults near existing Sway polling cadence and keep them injectable for tests.
- Exact process-gone probe implementation: use the most reliable local Bun/Linux seam available during implementation while preserving the owner abstraction.
- Exact Moonlight local-control evidence attachment point: record it when the existing launch/control handle exposes it, but do not require it for success.
- Exact event/evidence retention shape: add only enough structure for tests, logs, and future Phase 3 status work.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
Running
  │ managed child/session exits
  ▼
ExitObserved
  │ capture terminal status
  ▼
TearingDown
  │ adapter teardown evidence
  │ - process/session gone
  │ - optional adapter end evidence
  ▼
VerifyingReady
  │ readiness gates
  │ - launched surface gone
  │ - bounded cooldown elapsed
  │ - compositor probe recorded
  │
  ├─ gates pass ─────────────► IdleReady
  │
  └─ gate fails/times out ───► Failed(readiness)
                                │
                                ▼
                             Recovering
                                │ bounded recovery/release
                                ▼
                             IdleReady
```

```text
Re-entry during any post-exit phase:

ExitObserved
TearingDown
VerifyingReady
Failed
Recovering
    │
    └── launch request ──► session-busy
                           no prepare, no spawn, no foreground repair
```

```text
Desktop Moonlight/Gamescope readiness evidence:

Managed handle ─────────────► process/session gone gate
Foreground repair result ───► launched surface id(s)
Sway surface helper ────────► launched surface absence gate
Timer seam ─────────────────► cooldown gate
Sway tree probe ────────────► compositor evidence
Moonlight local-control ────► optional adapter evidence
```

---

## Implementation Units

### U1. Extend the owner contract for teardown/readiness stages

**Goal:** Give the foreground session owner explicit post-exit stages that can run adapter-provided teardown and readiness checks before releasing idle.

**Requirements:** R1, R2, R3, R5, R7; AE6, AE7

**Dependencies:** None

**Files:**
- Modify: `korri/deploy/desktop/foreground-session-owner.ts`
- Modify: `korri/deploy/desktop/foreground-session-owner.test.ts`
- Modify: `korri/shared/stream/foreground-session-lifecycle.ts`
- Modify: `korri/shared/stream/foreground-session-lifecycle.test.ts`

**Approach:**
- Add explicit optional adapter stages for teardown and readiness verification that run after terminal status is captured and before `ForegroundSessionReady` is emitted.
- Keep the shared lifecycle module pure; it may gain generic evidence helpers or event variants, but no deploy/runtime imports.
- Preserve `ExitObserved`, `TearingDown`, and `VerifyingReady` as distinct busy states while real work is running.
- Preserve the active session's terminal status when a later readiness failure occurs.
- Add injectable delay/clock/cancellation seams so cooldown and polling are testable and shutdown can abort in-flight readiness.
- Treat readiness-stage failures as `Failed`/`Recovering` with `stage: "readiness"`, then release only after bounded recovery behavior records evidence.

**Execution note:** Implement the owner behavior test-first; the important behavior is temporal and race-prone.

**Patterns to follow:**
- `korri/deploy/desktop/foreground-session-owner.test.ts` for deferred promises and state-entry gates.
- `korri/shared/stream/foreground-session-lifecycle.test.ts` for exhaustive non-idle rejection coverage.
- `tools/device/sessiond.ts` for restore/recover after a child exits.

**Test scenarios:**
- Happy path: child exit triggers teardown, readiness verification, cooldown, and only then emits ready/returns `IdleReady`.
- Edge case: a second launch during `ExitObserved`, `TearingDown`, `VerifyingReady`, `Failed`, or `Recovering` returns `Busy` without invoking adapter prepare/spawn again.
- Edge case: process/session and surface gates pass but cooldown has not elapsed; owner stays non-idle, re-entry returns `session-busy`, and evidence names the cooldown gate.
- Edge case: process/session and cooldown gates pass but the launched surface remains; owner stays non-idle, re-entry returns `session-busy`, and evidence names the lingering surface gate.
- Edge case: surface and cooldown gates pass but the process/session probe still reports alive; owner stays non-idle, re-entry returns `session-busy`, and evidence names the process/session gate.
- Error path: readiness verification timeout transitions to `Failed` with `stage: "readiness"`, then bounded recovery releases idle with failure evidence retained.
- Edge case: process/session, surface, and cooldown gates pass while compositor probe fails or Moonlight local-control evidence is absent; owner still releases `IdleReady` and records the evidence-only signal.
- Error path: recovery itself times out or throws; the owner follows the defined bounded release path and later launches are accepted with retained recovery evidence.
- Error path: adapter teardown rejects/throws after terminal status capture; owner records `stage: "cleanup"`, preserves the original terminal status, and proceeds through bounded recovery/release.
- Error path: adapter teardown returns a structured failure; owner records cleanup evidence, preserves the original terminal status, and proceeds through bounded recovery/release.
- Error path: adapter teardown exceeds its bounded budget; owner records timeout evidence with `stage: "cleanup"`, preserves the original terminal status, and proceeds through bounded recovery/release.
- Edge case: `terminateActiveSession` or `terminateActiveSessionNow` during teardown or readiness cancels polling without emitting a spurious readiness failure after shutdown starts.
- Integration: owner remains adapter-generic; tests do not require Sway, Moonlight, Bun subprocesses, or Gamescope.

**Verification:**
- The owner cannot return idle immediately from child exit unless teardown/readiness stages pass or bounded recovery completes.
- Existing Phase 1 busy rejection and launch success tests still pass.

---

### U2. Add stream-surface disappearance and compositor probe primitives

**Goal:** Extend the existing Sway stream-surface helper module with readiness primitives for proving the launched foreground surface has disappeared and the compositor is still queryable.

**Requirements:** R1, R4, R5; AE6, AE7

**Dependencies:** None

**Files:**
- Modify: `tools/device/game-stream-fullscreen.ts`
- Modify: `tools/device/game-stream-fullscreen.test.ts`

**Approach:**
- Add a helper adjacent to `waitForStreamSurface` that waits until a specific owned/launched surface set is absent from the Sway tree.
- Preserve the existing selector and ignored-window semantics, but make the readiness target explicit so pre-existing Gamescope windows cannot mask a newly launched surface that failed to disappear.
- Add a lightweight compositor probe that records whether a Sway tree query succeeds and returns parseable data.
- Keep timeouts, polling cadence, clock, and sleep injectable like existing wait helpers.

**Execution note:** Add characterization tests around the existing surface helpers before extending absence behavior.

**Patterns to follow:**
- `waitForStreamSurface`, `snapshotStreamSurfaceIds`, and `repairStreamSurface` in `tools/device/game-stream-fullscreen.ts`.
- Existing Sway tree fixture tests in `tools/device/game-stream-fullscreen.test.ts`.

**Test scenarios:**
- Happy path: absence helper returns when the owned launched surface ID is no longer present.
- Happy path: all owned launched surface IDs disappear while pre-existing ignored Gamescope surfaces remain; readiness still passes.
- Edge case: multiple owned launched surface IDs are tracked and only some disappear; readiness fails until every owned ID is absent and evidence names the lingering IDs.
- Edge case: pre-existing ignored Gamescope surfaces may remain present while the owned launched surface disappears; readiness still passes.
- Edge case: an empty owned-surface set produces a deterministic evidence result rather than silently proving the wrong thing.
- Error path: owned launched surface remains until timeout; helper fails with evidence naming the lingering surface IDs.
- Happy path: compositor probe succeeds against a parseable tree and records structured success evidence for future diagnostics.
- Error path: Sway tree query returns invalid JSON or throws; compositor probe records failed evidence without crashing unrelated helpers.
- Integration: helper uses the same selector and Sway runner abstraction as foreground repair.

**Verification:**
- Surface absence checks can distinguish the launch-owned surface from old/pre-existing surfaces.
- No duplicate Sway tree parsing logic is introduced elsewhere.

---

### U3. Capture launched surface identity in the Moonlight/Gamescope adapter

**Goal:** Make the desktop launch bridge carry the foreground surface identity from repair into lifecycle evidence so readiness checks know what to wait to disappear.

**Requirements:** R3, R4, R5, R6, R7; AE6, AE7

**Dependencies:** U1, U2

**Files:**
- Modify: `korri/deploy/desktop/launch-bridge.ts`
- Modify: `korri/deploy/desktop/launch-bridge.test.ts`
- Modify: `korri/deploy/desktop/main.ts`

**Approach:**
- Change the foreground repair dependency so it can return the repaired/launched surface identity instead of only succeeding with no value.
- Thread the repaired surface ID or post-spawn surface delta into foreground evidence on the active lifecycle session.
- Implement the desktop Moonlight/Gamescope adapter's teardown/readiness hook using the launched surface identity, the managed session handle, and the new surface disappearance helper.
- Record compositor probe evidence and optional adapter evidence without making them hard readiness requirements.
- Preserve warning-only foreground repair semantics from Phase 1: a foreground repair warning still allows a launch, but lack of surface identity should be explicit evidence that readiness will fall back to narrower gates.

**Execution note:** Start with bridge tests that reproduce the pre-existing-surface masking risk before wiring the implementation.

**Patterns to follow:**
- `createLaunchBridgeForegroundSessionOwner` in `korri/deploy/desktop/launch-bridge.ts`.
- Current launch bridge tests for input preflight, prepare failures, foreground warnings, and busy-before-side-effects.
- `createLocalMoonlightForegroundRepair` in `korri/deploy/desktop/main.ts`.

**Test scenarios:**
- Happy path: foreground repair returns a launched surface ID and the lifecycle records it as foreground/readiness evidence.
- Edge case: an old Gamescope surface exists before launch; readiness targets the newly repaired surface, not the old ignored one.
- Error path: launched surface persists after child exit until timeout; launch owner stays busy during verification and records readiness failure evidence.
- Error path: foreground repair cannot identify a surface; launch remains compatible with Phase 1 behavior, readiness records the missing surface identity, and the fallback mode skips only the surface-absence gate while preserving process/session and cooldown gates.
- Edge case: shutdown lands during foreground repair after spawn; no readiness evidence is emitted after cancellation and the active session follows the shutdown path.
- Integration: a launch request immediately after child exit but before surface disappearance returns `session-busy` and does not call prepare/spawn.

**Verification:**
- The Moonlight/Gamescope path can prove which surface belongs to the accepted launch.
- Existing successful launch, prepare failure, input failure, and foreground warning behavior remains stable.

---

### U4. Add process/session termination evidence to managed Moonlight handles

**Goal:** Ensure readiness can prove the managed local child/session is gone rather than relying only on the first `exited` promise resolution.

**Requirements:** R1, R4, R6, R7; AE6, AE7

**Dependencies:** U1

**Files:**
- Modify: `korri/deploy/desktop/moonlight-session-runner.ts`
- Modify: `korri/deploy/desktop/moonlight-session-runner.test.ts`
- Modify: `korri/products/app/stream/moonlight-launcher.ts`
- Modify: `tools/cli/moonlight-launcher.test.ts`

**Approach:**
- Extend the managed session handle shape with a generic process/session termination probe or equivalent evidence hook usable by the owner readiness stage.
- Preserve compatibility for non-desktop command runners that can only provide an `exited` promise; absence of a probe should be explicit evidence rather than a type break.
- Capture terminal evidence as richly as the local process API supports, including signal-style termination when available.
- Keep broad process cleanup out of scope; use the tracked managed child/session only.

**Execution note:** Use real configurable child-handle seams in tests rather than mock process globals.

**Patterns to follow:**
- `createDesktopMoonlightSessionRunner` and its controlled child tests.
- Phase 1 managed handle tests in `korri/deploy/desktop/moonlight-session-runner.test.ts`.
- `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md` for avoiding broad process matching.

**Test scenarios:**
- Happy path: managed child exits and the termination probe reports gone; readiness can proceed.
- Edge case: `exited` resolves but the process/session probe still reports alive; owner remains non-idle until the probe reports gone or the readiness budget expires.
- Error path: termination probe throws; evidence is recorded and readiness follows the configured failure/recovery path.
- Edge case: no process probe is available for a generic runner; an existing CLI launcher path still constructs successfully, preserves the `exited` promise contract, and records probe-unavailable evidence instead of requiring a desktop-only field.
- Error path: signal-like termination evidence is preserved when the child API exposes it.

**Verification:**
- Desktop readiness can distinguish "exit observed" from "process/session is gone".
- CLI and non-desktop Moonlight launch tests remain compatible.

---

### U5. Preserve typed busy behavior across the longer readiness window

**Goal:** Keep renderer/API behavior stable while proving that post-exit readiness now blocks re-entry until safe release.

**Requirements:** R2, R5, R6; F2; AE5, AE6, AE7

**Dependencies:** U1, U3, U4

**Files:**
- Modify: `korri/products/app/stream/local-stream-launch-rpc.test.ts`
- Modify: `korri/products/app/features/home/launcher-layer-bridge.test.ts`
- Modify: `korri/deploy/desktop/launch-bridge.test.ts`
- Modify: `tools/desktop/desktop-smoke.test.ts` if the desktop-local RPC smoke needs updated expectations

**Approach:**
- Keep `session-busy` as the sole renderer-visible category for re-entry during teardown/readiness/recovery.
- Add coverage that verifies the widened busy window after child exit but before readiness release.
- Avoid adding new renderer state or UI controls; Phase 3 owns visible lifecycle status.
- Ensure desktop shutdown still terminates/cancels the active owner path cleanly.

**Patterns to follow:**
- Existing `session-busy` mapping in `korri/products/app/features/home/launcher-layer-bridge.ts` tests.
- Existing desktop RPC schema tests in `korri/products/app/stream/local-stream-launch-rpc.test.ts`.
- Existing desktop smoke coverage for `/__korri/desktop/rpc` routing.

**Test scenarios:**
- Integration: launch request during `VerifyingReady` returns typed `session-busy` through the desktop RPC handler.
- Integration: renderer launcher maps post-exit readiness busy to the existing deterministic launch failure kind, including at least one `Recovering` or `Failed` state.
- Edge case: no additional prepare/input/spawn/foreground side effects occur for post-exit busy requests.
- Happy path: after readiness gates pass, a later launch is accepted normally.
- Error path: readiness failure/recovery busy responses remain typed and do not leak internal evidence to the renderer contract.

**Verification:**
- The external launch contract is stable while lifecycle behavior becomes more conservative.
- Phase 2 does not introduce UI or RPC status scope creep.

---

## System-Wide Impact

- **Interaction graph:** Renderer launch requests still enter through `app.desktop.launch`; the desktop launch bridge delegates to the foreground session owner; owner delegates post-exit readiness to adapter hooks; adapter uses Sway/process/local-control evidence where available.
- **Error propagation:** Busy remains a typed launch failure; readiness failures are lifecycle evidence and owner state transitions, not new renderer error categories in this phase.
- **State lifecycle risks:** The owner must not release idle while readiness checks are pending, must not wedge forever on a lingering surface, and must cancel checks during shutdown.
- **API surface parity:** The internal managed handle and adapter contracts may grow optional readiness/evidence hooks; the external desktop launch RPC should remain stable.
- **Integration coverage:** Cross-layer tests must prove child exit followed by lingering surface still rejects re-entry before prepare/spawn side effects.
- **Unchanged invariants:** Gamescope remains default-on for the validation path; foreground repair warnings remain non-fatal; Moonlight local-control remains optional evidence; launch queueing remains out of scope.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Readiness loop wedges and blocks all future launches | Use bounded budgets, failure/recovery transitions, and deterministic tests for timeout behavior. |
| Surface absence check watches the wrong surface | Capture launched surface identity after foreground repair and distinguish it from pre-existing ignored surfaces. |
| Generic owner becomes desktop/Moonlight-specific | Keep Sway/process logic in adapter hooks and deploy/tool modules; shared lifecycle remains pure. |
| Compositor probe gives false confidence | Record probe as evidence-only in this phase and rely on cooldown plus surface/process gates for readiness. |
| Shutdown races with readiness polling | Add cancellation seams and tests for graceful/emergency termination during verification. |
| Renderer users see confusing busy after a game visibly closed | Preserve typed busy now; defer user-facing explanation/disabled state to Phase 3. |

---

## Documentation / Operational Notes

- No user-facing docs are required for Phase 2 unless implementation reveals a new operator command or environment variable.
- Logs/events should make it clear when a session is post-exit but not yet ready, and which readiness gate delayed release.
- If implementation introduces configurable timeout/cooldown environment variables, document them next to the existing desktop/Moonlight runtime configuration rather than in product UI docs.

---

## Sources & References

- **Origin document:** [../../01KSBMG31W82JBVJBJ5TT15MZN-feat-default-gamescope-foreground-launch/requirements.md](../../01KSBMG31W82JBVJBJ5TT15MZN-feat-default-gamescope-foreground-launch/requirements.md)
- Prior phase: [../01KSGS9H29WESM50SDTRMQVWW8-feat-foreground-session-lifecycle-phase1/plan.md](../01KSGS9H29WESM50SDTRMQVWW8-feat-foreground-session-lifecycle-phase1/plan.md)
- Related code: `korri/shared/stream/foreground-session-lifecycle.ts`
- Related code: `korri/deploy/desktop/foreground-session-owner.ts`
- Related code: `korri/deploy/desktop/launch-bridge.ts`
- Related code: `tools/device/game-stream-fullscreen.ts`
- Related learning: [docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md](../../../docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md)
- Related learning: [docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md](../../../docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md)
