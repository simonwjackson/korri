# Flow analysis: focused Phase 1 foreground/session lifecycle

Scope reviewed: generic foreground/session lifecycle contract, Moonlight/Gamescope desktop launch adapter, and re-entry rejection. Phase 2 conservative readiness, rich UI feedback, queueing, and broad adapter coverage are treated as deferred.

## Codebase context

Relevant current path:

1. Renderer uses `LauncherLayerBridge` in `korri/products/app/features/home/launcher-layer-bridge.ts`.
2. It calls desktop-local RPC `app.desktop.launch` defined in `korri/products/app/stream/local-stream-launch-rpc.ts` through `korri/products/app/stream/local-stream-launch-client.ts`.
3. `korri/deploy/desktop/launch-bridge.ts` performs connection lookup, optional input preflight, local Moonlight Gamescope policy resolution, remote `prepareGame`, Sway surface snapshot, local Moonlight spawn, and foreground repair.
4. `korri/deploy/desktop/main.ts` wires `diagnosticMoonlightRunner`; it currently calls `replaceActiveMoonlightChild()` before every spawn, so a second launch kills/replaces the prior Moonlight child instead of rejecting.

Existing patterns to preserve:

- `tools/device/game-stream-state.ts` + `tools/device/game-stream-runner.ts`: pure lifecycle state helpers, `already-running` rejection, managed child handle, lock protection, status writes, side-effect failure cleanup.
- `tools/device/sessiond-state.ts` + `tools/device/sessiond.ts`: launch only from ready/home, explicit launch/game/restore/recover transitions, restore after game completion.
- RPC schemas use Effect Schema with typed categories: `korri/products/app/stream/local-stream-launch-rpc.ts`.
- Renderer launch failures map to `LaunchFailureKind` in `korri/shared/library/launcher.ts` and `LauncherLayerBridge`.

## User flows

1. **Desktop Moonlight launch from idle/ready**
   - Entry: Player selects a remote game in the Korri GUI.
   - Happy path: `LauncherLayerBridge` -> `app.desktop.launch` -> foreground owner accepts from `IdleReady` -> input preflight -> local Gamescope policy resolution -> remote prepare -> Sway snapshot -> Moonlight/Gamescope spawn with managed handle -> foreground repair -> RPC returns `launched`; owner remains non-idle until the managed child/session exits.
   - Terminal states: `Running` while Moonlight is alive; then `Exiting -> TearingDown -> VerifyingReady -> IdleReady` in Phase 1 with immediate readiness.

2. **Re-entry while a foreground session is not idle/ready**
   - Entry: double-click, retry, stale renderer action, or second RPC while owner is `Preparing`, `Spawning`, `Foregrounding`, `Running`, `Exiting`, `TearingDown`, `VerifyingReady`, `Failed`, or `Recovering`.
   - Happy path: owner rejects atomically before connection lookup, remote prepare, Sway snapshot, or local spawn; RPC returns typed busy/not-ready; current child is not killed or replaced.
   - Terminal state: current lifecycle state remains unchanged, with a rejection event/status record.

3. **Failure before local Moonlight spawn**
   - Entry: launch from idle/ready, but no upstream, input unavailable, policy resolution failure, or remote prepare failure.
   - Expected path: if the owner accepted the launch, it records failure and returns to idle after `Failed/Recovering`; if the failure is treated as request validation before acceptance, no active session is created. The plan must choose this boundary.
   - Terminal state: typed launch failure, no Moonlight child, no stale busy state.

4. **Remote prepare succeeds, local Moonlight/Gamescope fails**
   - Entry: launch accepted, host intent prepared, local spawn fails or exits during startup observation.
   - Current response shape: `prepared-no-moonlight` in `korri/deploy/desktop/launch-bridge.ts`.
   - Needed Phase 1 behavior: owner records partial failure evidence, does not enter `Running` without a handle, returns to idle after failure/recovery, and keeps existing remote intent expiry behavior visible.

5. **Moonlight exits after successful startup**
   - Entry: managed child exits normally or non-zero after bridge has returned `launched`.
   - Expected path: owner observes `exited`, records terminal status, performs Phase 1 immediate teardown/verify, and returns to `IdleReady`.
   - Deferred risk: this does not prove compositor stability; allowing a new launch immediately after child exit remains a Phase 2 readiness risk and should be called out explicitly.

## Gaps

### Critical

1. **Atomic accept/reject boundary is not specified.**
   - Why it matters: two simultaneous `app.desktop.launch` requests can both pass a non-atomic idle check and both prepare/spawn. The current async bridge has several awaits before spawn.
   - Code pattern: `tools/device/game-stream-runner.ts` acquires a lock and moves state before long-running work.
   - Default: owner should synchronously reserve `Preparing` before any await, and all non-idle states reject.

2. **Managed child/session handle is required, not optional for the adapter.**
   - Why it matters: current `MoonlightLaunchResult` only returns `started`/`failed` plus command; `diagnosticMoonlightRunner` stores `activeMoonlightChild` privately. Without `pid`, `exited`, and `terminate`, the owner cannot keep the lifecycle non-idle until exit or restore after exit.
   - Paths: `korri/products/app/stream/moonlight-launcher.ts`, `korri/deploy/desktop/main.ts`.
   - Default: a Phase 1 Moonlight adapter that cannot return a managed handle should fail closed with a typed adapter failure, not fall back to unmanaged spawn.

3. **Throwing preflight/launch stages can strand lifecycle state.**
   - Why it matters: current `preflightMoonlightInput` and `launchMoonlight` calls are not fully converted to typed bridge failures; e.g. Moonlight local-control setup can throw before runner execution. If this happens after owner acceptance, the owner must transition to failure and release.
   - Paths: `korri/deploy/desktop/launch-bridge.ts`, `korri/products/app/stream/moonlight-launcher.ts`.
   - Default: every adapter stage runs under owner `try/finally` semantics and maps thrown errors to typed failure events/results.

4. **Busy result is missing from the wire and renderer contracts.**
   - Why it matters: `LocalStreamLaunchFailureCategory` and `LaunchFailureKind` do not include session-busy/not-ready, so implementers may return defects, reuse unrelated categories, or present inconsistent failures.
   - Paths: `korri/products/app/stream/local-stream-launch-rpc.ts`, `korri/shared/library/launcher.ts`, `korri/products/app/features/home/launcher-layer-bridge.ts`.
   - Default: add `session-busy` (or `session-not-ready`) as a schema category and deterministic renderer `failureKind`/exit code.

5. **Current re-entry behavior must be removed, not hidden behind the owner.**
   - Why it matters: `replaceActiveMoonlightChild()` in `korri/deploy/desktop/main.ts` explicitly kills the previous child before spawning another. Leaving this path reachable defeats the core acceptance criterion.
   - Default: spawning should never terminate an existing active child; shutdown/owner cancellation is the only termination path.

### Important

6. **Ordering of busy vs host/input validation is ambiguous.**
   - Why it matters: if a session is running but the connection has dropped, current code would likely report `host-unavailable`; the lifecycle requirement says not-idle launches should be rejected predictably without prepare/spawn. Tests need one precedence rule.
   - Default: busy/not-ready takes precedence over connection, input, and policy validation.

7. **Accepted-failure vs rejected-validation states are unspecified.**
   - Why it matters: no-upstream, input-preflight failure, and prepare failure may either be simple request failures or lifecycle `Failed/Recovering` transitions. Different choices change event history and whether concurrent requests are blocked during cleanup.
   - Default: once the owner atomically accepts, every later failure is a lifecycle failure with events and a deterministic return to `IdleReady`.

8. **Foreground repair failure semantics are unclear.**
   - Why it matters: current bridge logs and still returns `launched` if Sway repair fails. A lifecycle with `Foregrounding` needs to say whether repair failure is terminal, warning-only, or adapter evidence.
   - Paths: `korri/deploy/desktop/launch-bridge.ts`, `tools/device/game-stream-fullscreen.ts`.
   - Default: preserve current warning-only behavior for Phase 1, but emit `foreground-repair-failed` evidence; do not mark ready until child/session exit.

9. **Phase 1 readiness limit needs an explicit acceptance boundary.**
   - Why it matters: the motivating Sobo crash can happen after clean Moonlight exit. If Phase 1 returns to `IdleReady` immediately after child exit, it may not fix that class. That is acceptable only if documented as Phase 2.
   - Default: Phase 1 readiness is “managed child/session exited and immediate teardown hooks completed,” not “compositor proven stable.”

10. **Lifecycle event/status surface is too easy to defer entirely.**
    - Why it matters: rich UI is deferred, but tests and operators need enough observability to prove accepted/rejected/transition/exit behavior. Existing runner/sessiond patterns expose status.
    - Default: add an in-memory event sink/status accessor on `korri/deploy/desktop/foreground-session-owner.ts`; no dashboard or renderer polling required in Phase 1.

11. **Remote prepare partial failure needs test coverage.**
    - Why it matters: if remote prepare succeeds and local Moonlight fails, a one-shot host intent may remain until expiry. The plan says cancellation is deferred, but the owner should not hide the partial state.
    - Paths: `korri/deploy/desktop/launch-bridge.ts`, `korri/products/app/stream/remote-stream-client.ts`, `tools/device/game-stream-launch-intent.ts`.
    - Default: keep `prepared-no-moonlight`, include session/request evidence, and emit partial-failure event.

12. **Desktop owner placement and shared boundary need to be explicit.**
    - Why it matters: putting Bun/Sway/Moonlight dependencies into `@shared` would violate repo boundaries; making the contract Moonlight-shaped would block later adapters.
    - Default: pure lifecycle vocabulary/helpers may live in `korri/shared/stream/foreground-session-lifecycle.ts`; stateful desktop owner belongs in `korri/deploy/desktop/foreground-session-owner.ts`.

### Minor

13. **UI launch controller only suppresses while the RPC promise is pending.**
    - Why it matters: after RPC returns `launched`, `useLibraryLaunchController` can allow another click; Phase 3 UI disabling is deferred, so Phase 1 must rely on server-side rejection.
    - Paths: `korri/shared/library/use-library-launch-controller.ts`, `korri/shared/library/launch-state.ts`.
    - Default: map busy to normal `Failed` launch state for now; no rich busy UI.

14. **Shutdown ownership handoff is unspecified.**
    - Why it matters: `stopDesktopServer()` currently calls `terminateActiveMoonlightChild()`. After the owner owns handles, shutdown should terminate through the owner to avoid duplicate state/termination paths.
    - Path: `korri/deploy/desktop/main.ts`.
    - Default: desktop shutdown calls `foregroundSessionOwner.stopActive()`/equivalent.

15. **Tests need deterministic state pauses.**
    - Why it matters: `TearingDown` and `VerifyingReady` may be immediate in Phase 1, making rejection in those states hard to test without sleeps.
    - Default: owner test harness should accept configured delays/hooks for each transition, following the configurable-real implementation style in `tools/device/game-stream-runner.test.ts`.

## Questions

1. When a launch arrives during an active session but the upstream connection is currently missing, should RPC return `session-busy` or `host-unavailable`? Stakes: test determinism and no side effects. Default: `session-busy` wins.
2. Is no-upstream/input/prepare failure after an idle launch considered an accepted lifecycle failure, or a validation rejection before lifecycle ownership? Stakes: event history and state release semantics. Default: owner accepts first, then records typed failure and returns to idle.
3. If Sway foreground repair fails after Moonlight starts, should Phase 1 still report `launched`? Stakes: current behavior vs lifecycle `Foregrounding` semantics. Default: report `launched` with warning event/evidence.
4. Should a Moonlight adapter that cannot return a managed handle be allowed in Phase 1? Stakes: re-entry rejection after RPC return is impossible without a durable exit monitor. Default: no; fail closed.
5. What exact busy category string should be public: `session-busy`, `session-not-ready`, or `foreground-session-busy`? Stakes: stable RPC/schema/UI contract. Default: `session-busy`.
6. Should Phase 1 expose lifecycle status over any endpoint, or only through an injected event/status accessor for tests/logs? Stakes: avoiding Phase 3 UI scope creep while keeping observability. Default: event/status accessor only.

## Recommended next steps

1. Update the Phase 1 plan to define the atomic owner contract before implementation: `canAcceptLaunch`, `acceptLaunch`, non-idle rejection, active handle, terminal status, and minimal events.
2. Add planned files/tests:
   - `korri/shared/stream/foreground-session-lifecycle.ts`
   - `korri/shared/stream/foreground-session-lifecycle.test.ts`
   - `korri/deploy/desktop/foreground-session-owner.ts`
   - `korri/deploy/desktop/foreground-session-owner.test.ts`
3. Require bridge tests in `korri/deploy/desktop/launch-bridge.test.ts` for busy-before-side-effects: no input preflight, no remote prepare, no snapshot, no Moonlight spawn, no foreground repair.
4. Require Moonlight handle propagation tests in `tools/cli/moonlight-launcher.test.ts` and remove/replace the `replaceActiveMoonlightChild()` re-entry path in `korri/deploy/desktop/main.ts`.
5. Add typed busy mapping tests in `korri/products/app/stream/local-stream-launch-rpc.ts`, `korri/products/app/features/home/launcher-layer-bridge.test.ts`, and `korri/shared/library/launcher.ts`.
6. Document explicitly that Phase 1 returns to ready after managed child/session exit only; compositor-stability gating remains Phase 2.
