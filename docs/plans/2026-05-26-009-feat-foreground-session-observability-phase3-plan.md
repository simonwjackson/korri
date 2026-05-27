---
title: feat: Expose foreground session lifecycle status
type: feat
status: active
date: 2026-05-26
origin: docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md
verify_command: "just typecheck && just test-unit && just desktop-smoke"
---

# feat: Expose foreground session lifecycle status

## Summary

Phase 3 exposes the foreground session owner's current lifecycle state and bounded recent evidence through a sanitized desktop-local status contract, then uses that state in the renderer to proactively disable or explain launch actions while preserving the Phase 1 `session-busy` rejection as the race-safe source of truth.

---

## Problem Frame

Phase 1 gave the desktop Moonlight/Gamescope launch path one lifecycle owner and typed re-entry rejection. Phase 2 kept the owner non-idle until teardown/readiness evidence proves the foreground session is safe for another launch. The renderer and operators still cannot observe that lifecycle except by attempting a launch and receiving `session-busy`, or by reading implementation logs/events indirectly.

That leaves two gaps from the origin brainstorm:

- Players can still be shown an apparently launchable surface while the owner is preparing, running, tearing down, verifying readiness, or recovering.
- Operators and agents cannot inspect a stable lifecycle status surface that explains request identity, state transitions, adapter outcomes, exits, readiness decisions, and recovery evidence after a launch or failure.

Phase 3 should make the lifecycle visible without turning it into a telemetry dashboard, without letting the renderer infer state from Moonlight/Sway/Gamescope directly, and without weakening server-side busy rejection.

---

## Requirements

- R1. Expose a read-only, desktop-local foreground session status surface sourced from the existing foreground session owner. (Origin R17; AE7)
- R2. Keep the wire status contract explicit, schema-validated, bounded, and sanitized; do not serialize owner internals or free-form adapter evidence directly. (Origin R13, R17; AE7)
- R3. Include enough status to diagnose accepted launches, rejected re-entry, state transitions, adapter outcomes, foreground/surface outcomes, child/session exits, readiness decisions, and recovery/failure decisions. (Origin R17; AE5, AE7)
- R4. Preserve renderer race safety: the launch RPC's typed `session-busy` rejection remains authoritative, even when the renderer proactively gates launch UI from a polled status snapshot. (Origin R14, R15; F2; AE5)
- R5. Give the renderer a pure UI-domain gate state that can disable or explain launch actions while avoiding direct dependency on Sway, Moonlight local-control, process probes, or raw lifecycle event internals. (Origin F2, F3; AE5, AE7)
- R6. Separate per-launch request identity from game identity so status, busy rejections, and operator evidence can distinguish repeated launches of the same game. (Origin R13, R17; AE7)
- R7. Provide an operator/tool inspection path and smoke coverage for the new status contract. (Origin A7, R17; AE7)
- R8. Preserve current Gamescope behavior, conservative readiness gates, shutdown cancellation semantics, and non-desktop launcher behavior. (Origin R1, R2, R4, R16)

**Origin actors:** A2 Player, A3 Foreground/session owner, A4 Launcher adapter, A7 Operator/agent  
**Origin flows:** F2 Re-entry while a session is not ready, F3 Moonlight-first remote stream launch  
**Origin acceptance examples:** AE5 re-entry rejection, AE7 lifecycle evidence

---

## Scope Boundaries

- This phase covers the desktop Moonlight/Gamescope renderer path first.
- The status endpoint is read-only and loopback/local-desktop only. Any remote exposure, authentication, Tailscale tunnel, or cross-host operator API is separate work.
- No launch queueing, cancel-and-relaunch, automatic retry, or wait-then-launch affordance.
- No new commands on the status surface: no terminate, cancel, reset, or force-ready action.
- No renderer subscription to Moonlight local-control, Sway trees, Gamescope state, or process probes. Those remain adapter evidence behind the owner.
- No full telemetry dashboard, timeline UI, analytics stream, or durable database of lifecycle events.
- No cloud-gaming/source-machine foreground-session status unification in this phase; source-host status-file contracts remain follow-up work.
- No broad migration of local app/emulator adapters through the lifecycle owner.
- No change to default-on Gamescope policy or config cascade semantics.

### Deferred to Follow-Up Work

- Unifying desktop lifecycle status with cloud-gaming/source-machine status files.
- Remote/operator-authenticated lifecycle status access.
- Durable lifecycle history beyond structured logs and the owner's bounded recent status view.
- Broader adapter rollout for non-Moonlight foreground app launch paths.
- Rich UI timeline/debug dashboard or operator event explorer.

---

## Context & Research

### Relevant Code and Patterns

- `korri/shared/stream/foreground-session-lifecycle.ts` defines the pure lifecycle states, busy rejection shape, active session identity, terminal status, and structured event vocabulary.
- `korri/deploy/desktop/foreground-session-owner.ts` is the authoritative in-process owner and already exposes `status(): { state, events }` with a bounded event history.
- `korri/deploy/desktop/launch-bridge.ts` is the desktop Moonlight/Gamescope adapter seam and the right place to mint per-launch request identity before entering the owner.
- `korri/deploy/desktop/create-desktop-app.ts` already exposes read-only desktop-local state through `GET /__korri/desktop/connection-status`; the foreground-session endpoint should follow this shape.
- `korri/deploy/desktop/connection-state-snapshot.ts` shows the split between internal controller state and JSON-safe snapshot state.
- `korri/products/app/stream/local-stream-launch-rpc.ts` and `korri/products/app/features/home/launcher-layer-bridge.ts` already carry `session-busy` from desktop RPC to renderer launch failures.
- `korri/shared/library/launch-state.ts`, `korri/shared/library/launch-state-root.tsx`, and `korri/shared/library/use-library-launch-controller.test.tsx` show the existing renderer launch state pattern.
- `korri/shared/themes/shift/molecules/ShiftLaunchFailureBanner.tsx` already renders a `session-busy` failure after a rejected launch attempt.
- `korri/deploy/portal/select-launcher-layer.ts` and `korri/products/app/features/home/HomeRuntimeLayersRoot.tsx` show runtime-layer selection between desktop-local and non-desktop launch behavior.
- `tools/desktop/desktop-smoke.ts` and `tools/cli/moonlight-runtime-watch.ts` are precedents for lightweight tool/smoke coverage of desktop-local runtime surfaces.

### Institutional Learnings

- `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`: the session owner is the source of truth; Gamescope, Moonlight, Sunshine, and Sway provide evidence but not renderer authority.
- `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md`: lifecycle supervision should expose typed state and fail closed through structured outcomes rather than unmanaged launch fallbacks.
- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`: status/intention boundaries should be small, structured, and trust-scoped rather than broad telemetry surfaces.
- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`: preserve last useful status and one-shot session correlation so operators can distinguish current activity from stale previous observations.
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md`: convert wire state into UI-domain ADTs and compose state-specific React children rather than pattern-matching raw async results across components.

### External References

- External research is not needed; this phase is grounded in the existing owner, desktop-local endpoint pattern, renderer state-component pattern, and repo-local lifecycle learnings.

---

## Key Technical Decisions

- The owner remains the single source of truth. Phase 3 publishes an observation of owner status; it does not introduce a second lifecycle controller.
- Publish a sanitized snapshot, not raw owner internals. Internal events may contain free-form adapter evidence; the public contract must be schema-validated and allowlisted.
- Use desktop-local HTTP for the live renderer/operator status seam. This follows the existing `connection-status` route and avoids adding another RPC command surface.
- Preserve `session-busy` as the authoritative safety net. The renderer gate is advisory/proactive; every launch attempt still goes through server-side owner acceptance.
- Mint unique request IDs per launch attempt and keep game IDs separate. This improves busy rejection correlation, repeated-launch diagnostics, and operator evidence without changing the renderer's existing game-selection payload.
- Collapse lifecycle detail for user-facing UI, but preserve detail for operator status. For example, `ExitObserved`, `TearingDown`, and `VerifyingReady` can render as one "cleaning up" launch gate while the endpoint keeps distinct state tags.
- Fail open for renderer status transport errors. If polling fails, show an `Unknown`/non-blocking explanation and rely on launch RPC rejection rather than trapping the user behind a stale status failure.
- Keep operator durability lightweight. The endpoint is a bounded live view; structured lifecycle events should also be logged so post-mortem evidence is not limited to the in-memory ring.

---

## Open Questions

### Resolved During Planning

- Transport for Phase 3 status: desktop-local read-only HTTP endpoint alongside `connection-status`.
- Renderer authority: proactive gate from status, but launch RPC `session-busy` remains authoritative.
- Evidence posture: allowlisted snapshot fields plus bounded event summaries; no raw adapter evidence dump.
- Scope: desktop Moonlight/Gamescope renderer path first; cloud/source-host status unification deferred.
- UI mapping: detailed lifecycle tags collapse into clear launch-action states for players.
- Polling failure posture: fail open to `Unknown` and keep click path server-validated.

### Deferred to Implementation

- Exact request ID format: use the repo's existing UUID/crypto seam if present; otherwise use a Bun/standard runtime ID generator behind a small local helper.
- Exact recent event count in the public snapshot: keep it bounded and injectable; do not bake owner history size into the renderer.
- Exact polling cadence: start with a simple visible-page cadence near one second and keep timing seams configurable in tests.
- Exact copy and visual treatment for disabled/explained launch actions: implement within existing Shift theme patterns and Storybook variants.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
ForegroundSessionOwner
  ├─ internal state/events/evidence
  ├─ structured logger mirror
  └─ status()
       │
       ▼
ForegroundSessionStatusSnapshot adapter
  ├─ state tag
  ├─ current request/game/session summary
  ├─ last terminal/failure/readiness summary
  ├─ bounded sanitized recent event summaries
  └─ server timestamp / schema version
       │
       ▼
GET /__korri/desktop/foreground-session-status
       │
       ├─ operator/tool/smoke reads JSON
       └─ renderer polling client decodes JSON
              │
              ▼
       ForegroundSessionGateState
              │
              ▼
       LaunchActionState = merge(gate state, local LaunchState)
              │
              ▼
       Shift launch affordance disabled/explained when not ready
```

```text
Renderer precedence:

local launch just clicked
  -> show local Launching for that game

owner status says Running/Cleaning/Recovering
  -> disable/explain launch actions for all games

status endpoint unknown/unreachable
  -> show optional unknown indicator, allow click
  -> launch RPC still rejects session-busy if unsafe
```

```text
Public snapshot principle:

Expose:
  stateTag, requestId, gameId, hostId/sessionId when safe,
  child/session identity when safe, failure category, terminal status,
  readiness gate names/outcomes, bounded event summaries.

Do not expose:
  raw command argv, environment, arbitrary adapter evidence objects,
  raw process stderr/stdout, unbounded event history,
  remote/control-plane secrets or transport details.
```

---

## Implementation Units

### U1. Define the foreground session status snapshot contract

**Goal:** Add a pure, schema-validated wire snapshot that represents lifecycle status without leaking raw owner internals.

**Requirements:** R1, R2, R3; AE7

**Dependencies:** None

**Files:**
- Create: `korri/shared/stream/foreground-session-status.ts`
- Create: `korri/shared/stream/foreground-session-status.test.ts`

**Approach:**
- Define a JSON-safe `ForegroundSessionStatusSnapshot` with a schema version, server timestamp, current lifecycle state tag, optional active/current summary, optional last terminal/failure/readiness summary, and bounded recent event summaries.
- Represent timestamps as ISO strings on the wire, following `korri/deploy/desktop/connection-state-snapshot.ts`.
- Keep event summaries allowlisted. Include event tag, lifecycle state tag(s), request/game identity when safe, stage/category names, terminal status, and readiness gate outcomes; omit raw free-form evidence by default.
- Include tolerant decode behavior for the renderer-facing adapter so unknown future state/event tags degrade to `Unknown` rather than crashing the UI.
- Keep this module pure: no deploy, product, Bun, Sway, Moonlight, or logger imports.

**Patterns to follow:**
- `korri/deploy/desktop/connection-state-snapshot.ts`
- `korri/products/app/stream/local-stream-launch-rpc.ts`
- `korri/shared/stream/foreground-session-lifecycle.ts`

**Test scenarios:**
- Happy path: an `IdleReady` snapshot decodes with no active session and an ISO `serverTimestamp`.
- Happy path: a `Running` snapshot decodes with active request/game identity and sanitized recent events.
- Happy path: a post-failure snapshot carries last terminal/failure/readiness summary without requiring an active session.
- Edge case: recent event summaries omit arbitrary nested evidence while preserving event tag, stage, category, and request/game identity.
- Edge case: repeated launches of the same `gameId` can be represented with different `requestId` values.
- Error path: malformed timestamps, unknown required fields, or unbounded/free-form evidence shapes fail schema validation.
- Compatibility path: renderer adapter treats unknown future lifecycle tags as `Unknown` rather than throwing in UI state conversion.

**Verification:**
- The public snapshot can satisfy AE7 without exposing raw adapter evidence or command/process internals.

---

### U2. Add request identity hardening and status snapshot adaptation

**Goal:** Ensure accepted launches and busy rejections carry a unique per-attempt request identity, then adapt owner status into the public snapshot shape.

**Requirements:** R2, R3, R6; AE5, AE7

**Dependencies:** U1

**Files:**
- Modify: `korri/deploy/desktop/launch-bridge.ts`
- Modify: `korri/deploy/desktop/launch-bridge.test.ts`
- Modify: `korri/deploy/desktop/foreground-session-owner.ts`
- Modify: `korri/deploy/desktop/foreground-session-owner.test.ts`
- Create or modify: `korri/deploy/desktop/foreground-session-status-snapshot.ts`
- Create: `korri/deploy/desktop/foreground-session-status-snapshot.test.ts`

**Approach:**
- Mint a unique `requestId` at the desktop launch bridge boundary for each `app.desktop.launch` call while preserving the existing game `id` as `gameId`.
- Thread the request identity into the existing owner acceptance and busy rejection path without changing the renderer launch payload.
- Add an adapter from `foregroundSessionOwner.status()` to `ForegroundSessionStatusSnapshot` in deploy-local code, where runtime timestamps and any owner-internal evidence interpretation belong.
- Preserve last terminal/failure/readiness summary after return to `IdleReady` until the next accepted launch overwrites it.
- Mirror lifecycle events to structured logs at the owner boundary, using sanitized event summaries so AE7 evidence is not limited to the in-memory status ring.

**Patterns to follow:**
- `korri/deploy/desktop/main.ts` `snapshotFromControllerState()` usage for connection status
- `korri/deploy/desktop/foreground-session-owner.test.ts` deferred handle tests
- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md` for preserving useful terminal status

**Test scenarios:**
- Happy path: two accepted launches of the same game across time receive distinct `requestId` values and the same `gameId`.
- Edge case: a busy rejection includes current request/game identity and attempted request/game identity without invoking prepare/spawn side effects.
- Happy path: owner status in `Running` adapts to a snapshot with active summary and bounded recent events.
- Happy path: owner status after child exit/readiness recovery adapts to `IdleReady` with last terminal/readiness summary preserved.
- Edge case: raw adapter evidence containing command arguments or arbitrary nested objects is not present in the public snapshot.
- Error path: failure during prepare, spawn, foregrounding, teardown, or readiness is represented with stage/category summaries operators can inspect.
- Logging path: emitted lifecycle events are mirrored through the structured logger with sanitized fields and without changing state transitions.

**Verification:**
- Busy rejections and status snapshots can correlate attempts even when the same game is launched repeatedly.

---

### U3. Expose a read-only desktop-local foreground session status endpoint

**Goal:** Publish the sanitized snapshot through the desktop Bun app for renderer, tools, and smoke checks.

**Requirements:** R1, R2, R3, R7, R8; AE7

**Dependencies:** U1, U2

**Files:**
- Modify: `korri/deploy/desktop/create-desktop-app.ts`
- Modify: `korri/deploy/desktop/create-desktop-app.test.ts`
- Modify: `korri/deploy/desktop/main.ts`
- Modify: `tools/desktop/desktop-smoke.ts`
- Modify: `tools/desktop/desktop-smoke.test.ts`

**Approach:**
- Add `getForegroundSessionStatus` to `CreateDesktopAppOptions`, analogous to `getConnectionState`.
- Mount `GET /__korri/desktop/foreground-session-status` next to the existing connection status route.
- Return `Cache-Control: no-store` and the schema-validated JSON snapshot.
- Wire `main.ts` so the endpoint reads from the single foreground session owner instance used by the launch bridge and desktop shutdown handler.
- Keep the endpoint local/read-only; do not add commands or remote exposure.
- Extend desktop smoke coverage to assert the endpoint returns a valid idle snapshot shape in the packaged desktop composition.

**Patterns to follow:**
- `GET /__korri/desktop/connection-status` in `korri/deploy/desktop/create-desktop-app.ts`
- `korri/deploy/desktop/create-desktop-app.test.ts` connection-status tests
- `tools/desktop/desktop-smoke.ts` route checks

**Test scenarios:**
- Happy path: endpoint returns an `IdleReady` snapshot with `no-store` headers when a foreground owner is configured.
- Happy path: endpoint reflects a provided active/busy snapshot from the injected accessor.
- Edge case: desktop app creation without a launch bridge/owner does not accidentally expose stale or fabricated foreground status.
- Edge case: endpoint output validates against `ForegroundSessionStatusSnapshot` schema.
- Error path: accessor failure returns a bounded error response and does not crash unrelated desktop routes.
- Smoke path: `desktop-smoke` verifies the route exists and the idle snapshot contract is stable.

**Verification:**
- Operators and tools can inspect lifecycle state without invoking a launch and without relying on raw logs.

---

### U4. Add renderer foreground session status client and gate state

**Goal:** Let the renderer observe desktop lifecycle status through a testable client/layer and convert it into a UI-domain gate ADT.

**Requirements:** R4, R5, R8; F2; AE5

**Dependencies:** U1, U3

**Files:**
- Create: `korri/products/app/stream/foreground-session-status-client.ts`
- Create: `korri/products/app/stream/foreground-session-status-client.test.ts`
- Create: `korri/shared/stream/foreground-session-gate-state.ts`
- Create: `korri/shared/stream/foreground-session-gate-state.test.ts`
- Modify: `korri/shared/library/library-atoms.ts`
- Create or modify: `korri/products/app/features/home/foreground-session-status-layer-live.ts`
- Create: `korri/products/app/features/home/foreground-session-status-layer-fixture.ts`
- Modify: `korri/products/app/features/home/HomeRuntimeLayersRoot.tsx`

**Approach:**
- Add a small client that fetches and decodes `/__korri/desktop/foreground-session-status` with injectable fetch/timing seams for tests.
- Add a live polling layer selected only for desktop-local runtime; non-desktop launch paths should use an inert/ready fixture so they do not poll a missing route.
- Define a pure renderer gate ADT, for example: `Ready`, `Preparing`, `Running`, `Cooling`, `Recovering`, `Unknown`, and `LoadError`.
- Map every lifecycle state tag to a gate case. Collapse `ExitObserved`, `TearingDown`, and `VerifyingReady` into a user-facing cleanup/cooling case while preserving detailed tags in the snapshot.
- Treat transport/decode errors as `Unknown` or `LoadError` that does not block launch attempts; the launch RPC remains authoritative.
- Pause or cancel polling cleanly when the layer unmounts; keep polling cadence injectable.

**Patterns to follow:**
- `korri/products/app/stream/local-stream-launch-client.ts`
- `korri/shared/library/library-atoms.ts`
- `korri/products/app/features/home/HomeRuntimeLayersRoot.tsx`
- `korri/shared/library/launch-state.ts`
- `korri/deploy/desktop/waiting-page/polling-loop.ts`

**Test scenarios:**
- Happy path: client fetches, decodes, and returns a valid status snapshot.
- Error path: HTTP 500, network failure, malformed JSON, or schema failure becomes `Unknown`/`LoadError` without throwing through React.
- Runtime path: non-desktop runtime does not poll the desktop endpoint and defaults to launch-ready gate behavior.
- Mapping path: `IdleReady` maps to `Ready`.
- Mapping path: `Preparing`, `Spawning`, and `Foregrounding` map to a launch-in-progress explanation.
- Mapping path: `Running` maps to a running-session explanation with current game/request identity when present.
- Mapping path: `ExitObserved`, `TearingDown`, and `VerifyingReady` map to a cleanup/cooling explanation.
- Mapping path: `Failed` and `Recovering` map to a recovery explanation with failure/readiness summary when present.
- Compatibility path: unknown future lifecycle tags map to `Unknown`.
- Cancellation path: polling stops on abort/unmount and does not update disposed state.

**Verification:**
- Renderer state derives from the owner snapshot, not from adapter-specific signals.

---

### U5. Merge lifecycle gate state with launch action UI behavior

**Goal:** Disable or explain launch actions proactively while preserving the existing launch controller and busy failure banner as fallback.

**Requirements:** R4, R5, R8; F2; AE5

**Dependencies:** U4

**Files:**
- Create: `korri/shared/library/launch-action-state.ts`
- Create: `korri/shared/library/launch-action-state.test.ts`
- Modify: `korri/shared/library/use-library-launch-controller.ts`
- Modify: `korri/shared/library/use-library-launch-controller.test.tsx`
- Modify: `korri/shared/themes/shift/pages/ShiftHomeReadyBody.tsx`
- Modify: `korri/shared/themes/shift/molecules/ShiftLaunchFailureBanner.tsx`
- Create or modify: `korri/shared/themes/shift/molecules/ShiftForegroundSessionGateNotice.tsx`
- Create: `korri/shared/themes/shift/molecules/ShiftForegroundSessionGateNotice.stories.tsx`
- Modify or create: `korri/shared/themes/shift/pages/ShiftHomePage.stories.tsx`

**Approach:**
- Introduce a pure `LaunchActionState` adapter that merges local `LaunchState` with the owner-derived `ForegroundSessionGateState`.
- Define precedence explicitly:
  - Local `Launching` for the clicked game explains the current renderer's in-flight launch.
  - Owner-derived non-ready states disable/explain launch actions globally.
  - `Unknown`/transport errors may show a soft warning but do not prevent attempting launch.
  - Server-side `session-busy` failure remains the fallback if another renderer or race beats the poll.
- Keep state conversion pure and unit-tested rather than scattering lifecycle checks inside theme components.
- Add a Shift theme notice/chip/banner for proactive busy/recovery/cooling explanations.
- Keep native HTML focus/activation semantics; do not introduce component-level navigation APIs.
- Cover visual states in Storybook using fixture layers rather than live polling.

**Patterns to follow:**
- `korri/shared/library/launch-state-root.tsx`
- `korri/shared/library/use-library-launch-controller.test.tsx`
- `korri/shared/themes/shift/molecules/ShiftLaunchFailureBanner.tsx`
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md`
- `docs/solutions/best-practices/focusable-actions-inside-status-clusters-2026-05-04.md` if adding a focusable status action

**Test scenarios:**
- Happy path: `Ready` gate plus local idle state leaves launch actions enabled.
- Happy path: local `Launching` displays in-flight feedback for the clicked game.
- Edge case: another renderer starts a launch; this renderer receives `Running` from status and disables/explains launch even though local `LaunchState` is idle.
- Edge case: `Cooling` disables launch and explains that Korri is waiting for session cleanup/readiness.
- Edge case: `Recovering` disables launch and explains the failure/recovery summary.
- Edge case: `Unknown` or status transport failure does not block activation, and a subsequent RPC `session-busy` still renders the existing failure banner.
- Edge case: rapid click before the next poll still returns typed `session-busy` from the bridge and is not treated as a generic defect.
- Accessibility path: disabled/explained controls remain navigable or clearly skipped according to existing spatial-navigation patterns, with semantic text for the reason.
- Storybook path: Ready, Launching, Running, Cooling, Recovering, Unknown/LoadError, and server-rejected `session-busy` states are represented with fixture data.

**Verification:**
- Players see why launch is unavailable before pressing confirm in common busy windows, while race windows remain protected by the server rejection.

---

### U6. Add operator/tool inspection coverage

**Goal:** Provide a lightweight tool path for agents/operators and pin the endpoint contract outside React.

**Requirements:** R3, R7; AE7

**Dependencies:** U1, U3

**Files:**
- Create: `tools/cli/foreground-session-status.ts`
- Create: `tools/cli/foreground-session-status.test.ts`
- Modify: `tools/artifacts/paths.ts` if artifact output is needed
- Modify: `justfile` only if a dedicated recipe is warranted by existing CLI conventions

**Approach:**
- Add a small CLI that reads the desktop status endpoint, validates it with the shared schema, and prints normalized JSON.
- Support a one-shot mode first; watch/artifact modes may be added if they fit existing CLI conventions without expanding into a dashboard.
- Keep endpoint URL/port configurable for tests and development.
- Use the same shared decode contract as the renderer so tools and UI agree on status shape.

**Patterns to follow:**
- `tools/cli/moonlight-runtime-watch.ts`
- `tools/cli/moonlight-runtime-watch.test.ts`
- `tools/artifacts/paths.ts`
- `tools/desktop/desktop-smoke.ts`

**Test scenarios:**
- Happy path: CLI fetches a valid status snapshot and prints normalized JSON.
- Error path: network failure exits non-zero with a concise diagnostic.
- Error path: invalid schema exits non-zero and identifies the status contract failure.
- Edge case: CLI preserves distinct request/game identity and recent event summaries in output.
- Optional watch path: watch mode emits changed snapshots without unbounded memory growth and stops cleanly on abort.

**Verification:**
- AE7 has a non-UI inspection path that agents/operators can run against the desktop-local status surface.

---

## Cross-Unit Test Matrix

- Unit: snapshot schema accepts valid idle, active, failed/recovering, and ready-after-terminal snapshots.
- Unit: snapshot schema rejects raw evidence, malformed timestamps, and invalid status shapes.
- Unit: request IDs are unique per launch attempt and distinct from `gameId`.
- Unit: owner status adapter preserves last terminal/readiness summary after release to `IdleReady`.
- Unit: every lifecycle state maps to a renderer gate case.
- Unit: launch action merge precedence covers local launching, remote busy, cleanup, recovery, unknown, and server-side busy fallback.
- Integration: desktop app route returns schema-valid foreground status and no-store headers.
- Integration: launch bridge busy rejection and status endpoint show the same current request/game identity.
- Integration: renderer runtime layers do not poll the desktop endpoint in non-desktop launch mode.
- Smoke: desktop smoke verifies the status route in an idle desktop composition.
- Storybook: Shift launch surface has fixture stories for ready, busy/running, cleanup, recovering, unknown, and rejected-busy states.

---

## Risks & Mitigations

- **Risk:** The status endpoint leaks adapter internals such as commands, environment, or raw evidence.  
  **Mitigation:** Use an allowlisted shared snapshot schema and sanitized adapter conversion; test that raw nested evidence is omitted.

- **Risk:** Renderer gate state becomes a second authority and diverges from launch RPC behavior.  
  **Mitigation:** Treat gate state as proactive UI only; preserve server-side owner acceptance and `session-busy` response as authoritative.

- **Risk:** Polling creates stale disabled UI or traps players after endpoint failures.  
  **Mitigation:** Fail open to `Unknown`, keep click path server-validated, and cancel/pause polling cleanly.

- **Risk:** The plan grows into a telemetry/dashboard project.  
  **Mitigation:** Limit Phase 3 to a bounded snapshot, structured logs, a lightweight CLI/smoke, and fixture Storybook states.

- **Risk:** Repeated launches of the same game remain hard to diagnose.  
  **Mitigation:** Mint a unique request ID per launch attempt and preserve `gameId` as separate product identity.

- **Risk:** Cloud-gaming/source-machine roles need similar status but do not run the desktop Bun app.  
  **Mitigation:** Explicitly defer status unification; do not bolt on a second ad hoc remote surface in this phase.

---

## Execution Posture

- Use TDD for behavior-bearing units, especially schema conversion, owner/request identity, endpoint shape, client failure modes, and UI state merging.
- Keep implementation slices atomic and commit each unit separately when tests pass.
- Avoid staging unrelated dirty worktree files.
- Prefer real configurable implementations and fixture layers over mock-only tests.
- Preserve existing Phase 1/2 tests and run focused tests before the full verify command.

---

## Verification

Primary verification:

```bash
just typecheck && just test-unit && just desktop-smoke
```

Additional focused checks during implementation:

```bash
bun test korri/shared/stream/foreground-session-status.test.ts
bun test korri/deploy/desktop/foreground-session-status-snapshot.test.ts
bun test korri/deploy/desktop/create-desktop-app.test.ts
bun test korri/products/app/stream/foreground-session-status-client.test.ts
bun test korri/shared/stream/foreground-session-gate-state.test.ts
bun test korri/shared/library/launch-action-state.test.ts
bun test tools/cli/foreground-session-status.test.ts
```

Known repo note: if `just lint` is run, unrelated pre-existing Biome import-order failures may still need separate cleanup.
