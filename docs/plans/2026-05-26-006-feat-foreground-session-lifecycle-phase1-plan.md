---
title: feat: Add foreground session lifecycle Phase 1
type: feat
status: completed
date: 2026-05-26
origin: docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md
verify_command: "just typecheck && just test-unit"
---

# feat: Add foreground session lifecycle Phase 1

## Summary

Introduce the Phase 1 foreground/session lifecycle seam: a generic contract, a desktop-local owner for the current Moonlight/Gamescope stream path, and typed re-entry rejection before any remote prepare or local spawn side effects. This plan keeps Gamescope in the path and defers conservative teardown/readiness checks to the next phase.

---

## Problem Frame

The current desktop Moonlight launch path can accept another launch after the renderer sees the first launch as started, while the desktop process still owns only ad hoc child tracking. That leaves no authoritative lifecycle state for “running,” “exiting,” or “not ready,” and current re-entry behavior can replace the active child instead of rejecting the launch.

---

## Requirements

- R1. Preserve default-on Gamescope behavior for the Moonlight/Gamescope validation path. (Origin R1, R2, R4)
- R2. Introduce a foreground/session lifecycle contract that is generic across launch adapters and not Moonlight-specific. (Origin R10, R11, R12, R13)
- R3. Route the desktop Moonlight/Gamescope remote stream launch through the lifecycle owner first. (Origin R15)
- R4. Reject launch requests while the lifecycle is not idle/ready, before host prepare, input preflight, local spawn, or foreground repair side effects. (Origin R14, R15; F2; AE5)
- R5. Keep the owner non-idle after a successful launch until the managed local child/session exits. (Origin R13, R15)
- R6. Emit minimal structured lifecycle evidence for accepted launches, rejected re-entry, state transitions, adapter outcomes, foreground repair warnings, child/session exit, and release back to idle. (Origin R17; AE7)
- R7. Preserve current prepare, Moonlight launch, Gamescope wrapping, and foreground repair behavior except where re-entry rejection requires a hard break from child replacement. (Origin R7, R15)

**Origin actors:** A2 Player, A3 Foreground/session owner, A4 Launcher adapter, A7 Operator/agent
**Origin flows:** F2 Re-entry while a session is not ready, F3 Moonlight-first remote stream launch
**Origin acceptance examples:** AE4 generic lifecycle for Moonlight/Gamescope, AE5 re-entry rejection, AE7 lifecycle evidence

---

## Scope Boundaries

- No conservative readiness checks after child/session exit in Phase 1.
- No Moonlight local-control dependency as a readiness gate in Phase 1.
- No launch queueing.
- No always-cancel-and-relaunch behavior.
- No broad UI lifecycle surface or launch-button disabled state beyond typed busy/failure mapping.
- No broad migration of every foreground adapter through the lifecycle owner.
- No host/Sunshine configuration changes.
- No Gamescope policy/cascade/default-wrapper changes in Phase 1 beyond preserving existing behavior; no scaling, filters, FSR, frame pacing, resolution forcing, quality profiles, or new opt-out semantics.
- No change to the remote game-stream runner lifecycle unless compile compatibility requires a shared type adjustment.
- No replacement of `docs/plans/2026-05-24-007-feat-default-gamescope-foreground-launch-plan.md`; this is a focused Phase 1 follow-up.

### Deferred to Follow-Up Work

- Phase 2 conservative readiness: require local teardown/readiness evidence before returning to idle/ready.
- Rich local diagnostic status/RPC and renderer-visible lifecycle state.
- Broader adapter rollout for local apps, remote source-machine foreground sessions, and non-Moonlight foreground paths.
- Moonlight local-control lifecycle evidence as adapter evidence for readiness and diagnostics.

---

## Context & Research

### Relevant Code and Patterns

- `korri/products/app/features/home/launcher-layer-bridge.ts` maps renderer launch requests to the desktop-local launch client.
- `korri/products/app/stream/local-stream-launch-rpc.ts` defines the desktop-local launch RPC result categories.
- `korri/deploy/desktop/launch-bridge.ts` currently owns the desktop launch sequence: connection lookup, input preflight, remote prepare, local Moonlight spawn, and foreground repair.
- `korri/deploy/desktop/main.ts` wires `diagnosticMoonlightRunner` and currently tracks/replaces `activeMoonlightChild` directly.
- `korri/products/app/stream/moonlight-launcher.ts` wraps Moonlight through Gamescope by default and contains the command-runner seam.
- `tools/device/game-stream-state.ts` and `tools/device/game-stream-runner.ts` show a pure state helper plus managed child/lock/status owner pattern.
- `tools/device/sessiond-state.ts` and `tools/device/sessiond.ts` show launch-only-from-home and restore/recover lifecycle patterns.
- `tools/device/game-stream-fullscreen.ts` provides existing Sway surface snapshot and foreground repair helpers.

### Institutional Learnings

- `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`: Gamescope is an adapter; foreground/session policy owns focus, lifecycle, restore, and recovery.
- `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md`: route launch handoff through a long-lived session owner and reject launches from non-ready states.
- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`: preserve one-shot stream prepare semantics and avoid mutating stale session state on re-entry.
- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`: keep boot/control-plane concerns separate from session-scoped graphical execution.
- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`: use real configurable seams and controlled child/process handles rather than mock-only tests.

### External References

- External research is not needed for Phase 1; the work is grounded in existing repo patterns and repo-local lifecycle learnings.

---

## Key Technical Decisions

- Contract first, owner second: define pure lifecycle vocabulary separately from the desktop owner so the abstraction stays reusable while Bun/Sway/Moonlight wiring remains deploy-local.
- Busy wins over validation: re-entry rejection happens before connection lookup, input preflight, host prepare, local spawn, or foreground repair so a busy request has no side effects.
- Accepted failures are lifecycle events: once the owner accepts from idle/ready, later adapter failures transition through failure/recovery and release deterministically.
- Managed handle is required for successful desktop running state: generic Moonlight CLI callers may keep a compatibility path, but the desktop adapter must use a handle-returning managed runner and must not report `launched` from an unmanaged start.
- Preserve current foreground repair semantics: repair failure remains warning-only for Phase 1, but it becomes observable lifecycle evidence.
- Remove replacement behavior from the spawn path: re-entry must not kill or replace an active Moonlight/Gamescope child; explicit shutdown remains the owner-controlled termination path.
- Use staged adapter ownership: the owner owns lifecycle transitions, and the first Moonlight adapter exposes prepare, spawn, foreground, and exit-observation stages rather than hiding the whole launch behind one opaque async function.
- Keep readiness shallow in Phase 1: returning to idle after managed child/session exit is acceptable here, with compositor-stability gating deferred.
- Split graceful and emergency shutdown: normal signal handling should await owner termination where possible, while process-exit fallback may use a synchronous best-effort terminate path.

---

## Open Questions

### Resolved During Planning

- Busy precedence: `session-busy` should take precedence over host/input/prepare validation.
- Sway foreground repair failure: keep current warning-only success semantics for Phase 1.
- Moonlight local-control readiness: defer to Phase 2+; Phase 1 only leaves room for adapter evidence.
- Plan relationship: create a new focused Phase 1 plan rather than editing the prior default-Gamescope plan.

### Deferred to Implementation

- Exact helper and type names: choose locally consistent names while preserving the contract boundaries in this plan.
- Exact lifecycle event retention policy: keep enough recent events for tests/logging without adding a product dashboard.
- Exact shutdown method name: desktop shutdown should terminate through the owner, but the final API name can follow implementation context.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
                 launch request
                       │
                       ▼
        ┌────────────────────────────┐
        │ ForegroundSessionOwner     │
        └────────────────────────────┘
             │                │
   idle/ready? yes       no, not ready
             │                │
             ▼                ▼
      accept session     reject: session-busy
             │
             ▼
   Moonlight/Gamescope adapter first
```

```text
idle-ready
   │
   ▼
preparing ─► spawning ─► foregrounding ─► running
                                          │
                                          ▼
                                   exit-observed
                                          │
                                          ▼
                                   tearing-down
                                          │
                                          ▼
                                  verifying-ready
                                          │
                                          ▼
                                     idle-ready
```

```text
ForegroundSessionOwner
  owns: state, active request, busy rejection, minimal events

Adapter
  owns: prepare host, spawn child, foreground repair, exit handle

Moonlight/Gamescope
  is first adapter, not the abstraction
```

---

## Implementation Units

### U1. Define the pure foreground/session lifecycle contract

**Goal:** Add a generic, pure lifecycle vocabulary that can represent foreground launch ownership without depending on Moonlight, Bun, Sway, or desktop deploy wiring.

**Requirements:** R2, R4, R5, R6; AE4, AE5, AE7

**Dependencies:** None

**Files:**
- Create: `korri/shared/stream/foreground-session-lifecycle.ts`
- Create: `korri/shared/stream/foreground-session-lifecycle.test.ts`

**Approach:**
- Model the lifecycle states from idle/ready through preparing, spawning, foregrounding, running, exit-observed, tearing-down, verifying-ready, failed, and recovering.
- Include an active session shape that can hold request identity, game identity, host/session references, child/session identity, terminal status, foreground evidence, and adapter evidence without naming Moonlight as the abstraction.
- Provide pure helpers for acceptability, state transitions, busy rejection data, terminal outcomes, and event creation.
- Keep this module side-effect-free and importable by product/deploy code without pulling deploy dependencies into shared.

**Execution note:** Implement the state helpers test-first; this contract is easiest to get right with exhaustive state tests before wiring I/O.

**Patterns to follow:**
- `tools/device/game-stream-state.ts`
- `tools/device/sessiond-state.ts`
- `korri/shared/stream/moonlight-control-protocol.ts`

**Test scenarios:**
- Happy path: idle/ready accepts a new launch and records request/game identity.
- Edge case: every non-idle state returns a busy/not-ready rejection.
- Edge case: busy rejection preserves the current active session identity when present.
- Happy path: state transition events preserve previous state, next state, request identity, and adapter-generic evidence.
- Error path: failed/recovering states are not launch-accepting states.
- Integration: lifecycle types remain pure and do not import deploy, product API, Bun, Sway, or Moonlight modules.

**Verification:**
- The contract can describe Moonlight/Gamescope without mentioning Moonlight-specific fields as required data.
- All non-idle states are covered by tests and reject launch attempts.

---

### U2. Add typed busy results to the desktop launch contract

**Goal:** Make re-entry rejection a first-class desktop launch outcome from RPC through renderer launch mapping.

**Requirements:** R4, R6; F2; AE5

**Dependencies:** U1

**Files:**
- Modify: `korri/products/app/stream/local-stream-launch-rpc.ts`
- Create: `korri/products/app/stream/local-stream-launch-rpc.test.ts`
- Modify: `korri/shared/library/launcher.ts`
- Modify: `korri/products/app/features/home/launcher-layer-bridge.ts`
- Test: `korri/products/app/features/home/launcher-layer-bridge.test.ts`

**Approach:**
- Add a stable busy/not-ready failure category to the desktop-local launch response union.
- Map that category into the existing `LaunchResult` failure pathway so current UI failure handling continues to work without Phase 3 lifecycle UI.
- Keep existing failure categories and prepared-no-Moonlight behavior unchanged.

**Execution note:** Start with renderer bridge mapping coverage so the new category has an end-to-end consumer before bridge integration returns it.

**Patterns to follow:**
- Existing failure categories in `korri/products/app/stream/local-stream-launch-rpc.ts`
- Existing response mapping in `korri/products/app/features/home/launcher-layer-bridge.ts`

**Test scenarios:**
- Happy path: busy/not-ready response maps to a deterministic launch failure kind and exit code.
- Regression: existing host, prepare, input, and Moonlight failure mappings remain unchanged.
- Schema: `korri/products/app/stream/local-stream-launch-rpc.test.ts` proves the desktop launch RPC response schema accepts the new category and rejects unknown categories.

**Verification:**
- A busy rejection can travel over the typed desktop RPC and be displayed by existing launch failure UI as a normal typed failure.

---

### U3. Return managed session handles from the Moonlight launch seam

**Goal:** Let the foreground/session owner observe local Moonlight/Gamescope process exit without keeping child state hidden inside desktop main wiring.

**Requirements:** R1, R5, R7; F3; AE4

**Dependencies:** U1

**Files:**
- Modify: `korri/products/app/stream/moonlight-launcher.ts`
- Modify: `tools/cli/moonlight-launcher.test.ts`
- Create: `korri/deploy/desktop/moonlight-session-runner.ts`
- Create: `korri/deploy/desktop/moonlight-session-runner.test.ts`
- Modify: `korri/deploy/desktop/main.ts`

**Approach:**
- Extend the Moonlight command-runner seam so successful starts can carry a managed session handle with child identity, exit observation, and termination capability.
- Preserve the existing command/result behavior for CLI and tests that only care about started/failed status, but define a desktop-managed runner wrapper whose success path always includes a handle.
- Extract the desktop diagnostic Moonlight runner and output-draining behavior into a testable desktop module instead of leaving replacement/shutdown behavior embedded in the composition root.
- Remove launch-time replace/kill behavior from the spawn path; termination should move to explicit owner shutdown/cancel behavior.
- Preserve default Gamescope wrapping, configured Gamescope command behavior, explicit Gamescope disabled behavior, fallback behavior, input preflight, and diagnostic output draining.

**Execution note:** Add handle propagation tests before changing desktop main wiring; keep Gamescope default tests passing unchanged.

**Patterns to follow:**
- `tools/device/game-stream-runner.ts` managed child shape
- Existing `tools/cli/moonlight-launcher.test.ts` Gamescope wrapping tests
- Current `collectAndLogMoonlightOutput` diagnostic behavior in `korri/deploy/desktop/main.ts`

**Test scenarios:**
- Happy path: when a runner returns a managed handle, `launchMoonlight` includes it in the started result.
- Happy path: default Moonlight launch still invokes Gamescope with the existing minimal wrapper.
- Edge case: explicit Gamescope disabled still launches unwrapped only when explicitly configured.
- Error path: early non-zero startup exit remains a Moonlight launch failure.
- Regression: Nix fallback behavior still works when installed Moonlight fails and fallback is allowed.
- Integration: desktop diagnostic runner returns an observable handle for a started child and does not contain launch-time replacement/termination behavior.
- Integration: desktop runner shutdown terminates only the active owned handle through the explicit shutdown path.

**Verification:**
- The foreground owner can observe the local session exit through a returned handle.
- No launch-time code path silently replaces an existing active child.

---

### U4. Add the desktop foreground session owner

**Goal:** Introduce the stateful desktop owner that atomically accepts launches from idle/ready, rejects re-entry, records minimal lifecycle evidence, and remains non-idle until the managed session exits.

**Requirements:** R2, R3, R4, R5, R6; F2, F3; AE4, AE5, AE7

**Dependencies:** U1, U3

**Files:**
- Create: `korri/deploy/desktop/foreground-session-owner.ts`
- Create: `korri/deploy/desktop/foreground-session-owner.test.ts`

**Approach:**
- Build a deploy-local owner around a staged adapter contract rather than one opaque launch function.
- Reserve the lifecycle state synchronously before any awaited adapter work so concurrent launch requests cannot both pass the idle check.
- Reject all not-idle states with generic busy rejection data and no adapter invocation; U5 maps that data to the typed desktop RPC category.
- Let the owner drive Phase 1 state transitions around adapter stages: accepted/preparing, spawning, foregrounding, running, exit-observed, tearing-down, verifying-ready, idle-ready.
- Keep `tearing-down` and `verifying-ready` shallow in Phase 1, but make them explicit states/events so Phase 2 can deepen them without replacing the contract.
- Expose minimal in-memory status/events for tests and structured logging; do not add a public status endpoint in this unit.
- Provide both graceful async termination and synchronous best-effort emergency termination for desktop shutdown paths.

**Execution note:** Use deterministic controlled session handles and transition hooks in tests so busy rejection can be asserted in each state without sleeps.

**Patterns to follow:**
- Atomic start/reject pattern in `tools/device/game-stream-runner.ts`
- Home-only launch rejection in `tools/device/sessiond.ts`
- Pure lifecycle helpers from U1

**Test scenarios:**
- Happy path: an idle owner accepts a launch, invokes the adapter once, enters running, observes exit, and returns to idle-ready.
- Edge case: a second launch during preparing is rejected and the adapter is not invoked.
- Edge case: a second launch during spawning is rejected and the adapter is not invoked.
- Edge case: a second launch during foregrounding is rejected and the adapter is not invoked.
- Edge case: a second launch during running is rejected and the adapter is not invoked.
- Edge case: a second launch during exit-observed, tearing-down, verifying-ready, failed, or recovering is rejected and the adapter is not invoked.
- Error path: adapter input/prepare failure records failure evidence and returns to idle-ready.
- Error path: adapter spawn failure records failure evidence and returns to idle-ready.
- Error path: an adapter rejection/throw after acceptance records failure evidence and releases back to idle-ready.
- Error path: foreground repair warning does not fail a successfully started session.
- Edge case: two same-turn launch calls from idle result in exactly one adapter invocation and one busy rejection.
- Integration: event history records accepted, rejected, state changed, adapter outcome, session exited, and ready events in order.
- Integration: graceful owner shutdown terminates the active managed session and releases state deterministically.
- Integration: emergency owner termination sends best-effort termination without relying on awaited cleanup.

**Verification:**
- Re-entry rejection is atomic and side-effect-free across every non-idle state.
- The owner remains non-idle after the launch RPC can return success and until the managed session exits.

---

### U5. Route desktop launch RPC through the foreground session owner

**Goal:** Make `app.desktop.launch` use the Phase 1 owner before any current launch side effects, while preserving the existing Moonlight/Gamescope launch sequence for accepted requests.

**Requirements:** R1, R3, R4, R5, R6, R7; F2, F3; AE4, AE5, AE7

**Dependencies:** U2, U3, U4

**Files:**
- Modify: `korri/deploy/desktop/launch-bridge.ts`
- Modify: `korri/deploy/desktop/create-desktop-app.ts`
- Modify: `korri/deploy/desktop/main.ts`
- Test: `korri/deploy/desktop/launch-bridge.test.ts`
- Test: `korri/deploy/desktop/create-desktop-app.test.ts`
- Test: `tools/desktop/desktop-smoke.test.ts`

**Approach:**
- Add the foreground session owner as an injectable launch-bridge dependency.
- Move the busy/not-ready check ahead of connection lookup, input preflight, Gamescope policy resolution, remote prepare, Sway snapshot, local spawn, and foreground repair.
- Split the existing accepted launch sequence into the owner-managed staged adapter: prepare host/input/policy, spawn local Moonlight/Gamescope, foreground/repair, and observe managed exit.
- Require the accepted desktop Moonlight adapter to provide a managed session handle before returning launched; if an injected test runner reports started without a handle, return a typed adapter failure and release the owner rather than entering an unobservable running state.
- Preserve host prepare failure categories, prepared-no-Moonlight behavior, IPv6 host normalization, input preflight behavior, Gamescope policy resolution, and foreground repair warning behavior.
- Update desktop shutdown to terminate through the owner instead of direct global child replacement state; signal handlers should await graceful termination where possible, with process-exit fallback using the synchronous best-effort owner path.
- Keep the desktop-local RPC mounted at the existing internal RPC surface.

**Execution note:** Start with bridge tests for busy-before-side-effects: no preflight, prepare, snapshot, Moonlight spawn, or foreground repair should run when the owner is not idle.

**Patterns to follow:**
- Existing injected dependency style in `korri/deploy/desktop/launch-bridge.ts`
- Current composition seam in `korri/deploy/desktop/create-desktop-app.ts`
- Current diagnostic logging in `korri/deploy/desktop/main.ts`

**Test scenarios:**
- Covers AE5. Given the owner is running, when `app.desktop.launch` is called, it returns typed busy and does not call any injected launch-path dependency: connection lookup, input preflight, Gamescope policy resolution, remote prepare, Sway snapshot, local spawn, or foreground repair.
- Happy path: accepted launch still prepares the selected remote game and starts Moonlight through the resolved host address.
- Happy path: accepted launch still passes resolved local Gamescope policy to Moonlight.
- Edge case: busy rejection takes precedence over missing connection.
- Edge case: busy rejection takes precedence over input preflight failure.
- Error path: host prepare failure returns the existing prepare failure category and releases the owner back to idle-ready.
- Error path: Moonlight startup failure returns `prepared-no-moonlight` and releases the owner back to idle-ready.
- Error path: Moonlight started-without-managed-handle returns the chosen adapter failure outcome, records lifecycle evidence, and releases the owner back to idle-ready.
- Error path: thrown/rejected adapter stages after acceptance return typed failure evidence and release the owner back to idle-ready.
- Error path: foreground repair failure logs/emits warning evidence but still returns launched when Moonlight starts.
- Integration: after a successful launch returns, a second RPC before the managed child exits returns busy.
- Integration: after the managed child exits and Phase 1 teardown completes, a later RPC can be accepted.
- Regression: disconnected desktop composition still returns the existing unconfigured launch bridge response when no launch bridge is wired.

**Verification:**
- Accepted launch behavior remains compatible with existing renderer expectations.
- Re-entry requests cannot trigger remote prepare or local Moonlight/Gamescope spawn while an active session is not idle/ready.

---

## System-Wide Impact

- **Interaction graph:** Renderer launch requests still enter through the `Launcher` service and desktop-local RPC, but the desktop bridge now delegates acceptance and lifecycle ownership to one foreground/session owner.
- **Error propagation:** Busy/not-ready becomes a typed launch failure category. Existing host, prepare, input, and Moonlight failures keep their current categories.
- **State lifecycle risks:** The main risk is stranding the owner in non-idle after thrown adapter errors; every accepted path must release through failure/recovery or observed exit.
- **API surface parity:** The new busy category touches the desktop-local RPC and renderer launch mapping only; public headless server RPCs do not gain lifecycle status in Phase 1.
- **Integration coverage:** Unit tests must prove busy-before-side-effects at the bridge boundary, not only pure state rejection.
- **Unchanged invariants:** Gamescope remains default-on for Moonlight unless explicitly disabled by policy; remote prepare remains known-game-id only; no queueing or cancel/relaunch policy is introduced.

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Owner rejects too late and remote prepare still happens on re-entry | Medium | High | Reserve lifecycle before awaits and test busy-before-side-effects at the bridge boundary. |
| Owner cannot observe local child exit | Medium | High | Require a managed session handle from successful Moonlight launch in Phase 1. |
| Existing diagnostic runner replacement behavior survives | Medium | High | Extract the runner into a testable module, remove launch-time replace semantics, and route termination through owner shutdown only. |
| Phase 1 is mistaken for full Sobo crash fix | Medium | Medium | Document that conservative readiness remains Phase 2 and tests only prove re-entry rejection while managed session is active. |
| Shared lifecycle module accumulates desktop-specific details | Medium | Medium | Keep pure contract in shared and all Bun/Sway/Moonlight wiring in desktop deploy code. |
| Busy category breaks existing UI assumptions | Low | Medium | Map it through existing failed launch handling and keep rich UI state deferred. |

---

## Documentation / Operational Notes

- No product documentation update is required for Phase 1 unless implementation exposes a stable diagnostic command or endpoint.
- PR notes should call out that Phase 1 prevents launch re-entry while a managed session is active, but Phase 2 is still required for compositor-stability readiness after exit.
- Manual Sobo validation after implementation should record first launch, attempted re-entry while running, normal exit, and whether post-exit relaunch behavior still needs Phase 2 readiness gating.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md](../brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md)
- Related plan: [docs/plans/2026-05-24-007-feat-default-gamescope-foreground-launch-plan.md](2026-05-24-007-feat-default-gamescope-foreground-launch-plan.md)
- Related plan: [docs/plans/2026-05-26-003-feat-moonlight-local-control-protocol-plan.md](2026-05-26-003-feat-moonlight-local-control-protocol-plan.md)
- Related learning: [docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md](../solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md)
- Related learning: [docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md](../solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md)
- Related learning: [docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md](../solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md)
