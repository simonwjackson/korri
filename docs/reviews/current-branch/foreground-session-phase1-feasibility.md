# Feasibility review: foreground session lifecycle Phase 1

Document reviewed: `../../../work/.archive/01KSGS9H29WESM50SDTRMQVWW8-feat-foreground-session-lifecycle-phase1/plan.md`

## Findings

### P1 — Optional managed handles make the documented “fail closed” path unsafe

- **Confidence:** 75
- **Disposition:** manual
- **Evidence:** U3 keeps the managed session handle optional to preserve current Moonlight result behavior (`lines 260-261`), while U5 says a successful accepted Moonlight launch without a handle should “fail closed as an adapter failure” (`line 354`). In the current code, `CommandRunner.run` can return `{ status: "started" }` with no handle (`korri/products/app/stream/moonlight-launcher.ts:55-58`), and the default runner actually spawns/unrefs a child before returning that no-handle success (`moonlight-launcher.ts:339-359`).
- **Why this matters:** Once `launchMoonlight` returns `started` without a managed handle, the local Moonlight/Gamescope side effect has already happened. Treating that as an adapter failure and releasing the owner to idle would leave an untracked process running, directly violating the Phase 1 requirement that the owner remain non-idle until the managed child/session exits.
- **Needed plan change:** Specify a stricter desktop-managed launch contract instead of relying on the optional CLI-compatible result. The accepted desktop adapter should either be typed so success must include an observable/terminable handle, or retain an emergency handle and terminate before releasing state if handle propagation fails.

### P2 — The owner/adapter boundary is not specific enough to support the required stage states

- **Confidence:** 75
- **Disposition:** manual
- **Evidence:** U4 says the owner wraps “a generic launch adapter function” (`line 300`) but also requires transitions through `preparing`, `spawning`, `foregrounding`, `running`, etc. (`line 303`) and tests busy rejection in each intermediate state (`lines 317-321`). The current bridge is one sequential function that performs connection lookup, input preflight, Gamescope resolution, prepare, snapshot, spawn, and repair internally (`korri/deploy/desktop/launch-bridge.ts:133-198`).
- **Why this matters:** A single async adapter function cannot let the owner authoritatively own those intermediate states unless the adapter contract includes staged calls or state-transition callbacks. Without that decision, implementers must choose the core architecture themselves, and tests for “busy during spawning/foregrounding” will either require ad hoc hooks or collapse to a coarse “preparing” state.
- **Needed plan change:** Define the adapter interface shape at plan time: e.g. owner-controlled staged operations (`prepare`, `spawn`, `foreground`, `observeExit`) or an adapter callback protocol with ownership rules for state transitions and failure release.

### P2 — Desktop shutdown through the owner conflicts with the current synchronous exit path

- **Confidence:** 100
- **Disposition:** proposed
- **Evidence:** U4 requires an owner shutdown/termination path (`line 306`), and U5 says desktop shutdown should terminate through the owner (`line 356`). Current `main.ts` shutdown is synchronous: `stopDesktopServer()` calls `terminateActiveMoonlightChild()` directly (`korri/deploy/desktop/main.ts:78-91`), and signal handlers call `stopDesktopServer()` and immediately `process.exit(0)` (`main.ts:94-103`).
- **Why this matters:** A typical managed-session `terminate()`/shutdown path is promise-based. If the implementation replaces the direct synchronous kill with an async owner shutdown, the `exit` handler cannot await it and the SIGINT/SIGTERM handlers will force process exit before termination/release completes. That can leak the active Moonlight/Gamescope process or skip lifecycle evidence.
- **Needed plan change:** Specify the shutdown mechanics: either expose a synchronous best-effort `terminateActiveNow()` for process-exit use, or make signal handling async and delay `process.exit` until owner termination has run. Keep the regular graceful shutdown path separate from the process `exit` fallback.
