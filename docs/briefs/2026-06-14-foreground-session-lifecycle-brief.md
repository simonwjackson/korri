---
date: 2026-06-14
topic: foreground-session-lifecycle
artifact: brief
backlog: 01KV3A5RNCMMGR8FY5Y8MKPWGD
---

# Foreground Session Lifecycle: Local and Remote Are Implementation Details

## Chosen Thing

A single Korri-owned foreground session lifecycle that every launch path reports into, regardless of whether the foreground workload is local, Steam/AppID-backed, emulator-backed, or remote-stream-backed. The public lifecycle surface should answer: **what foreground experience is active, what state is it in, how do I stop it, and what evidence explains failures?** It should not force callers or UI code to know whether the implementation used sessiond, a one-shot game-stream intent, Sunshine, Moonlight, Steam LaunchOptions, a wait monitor, or a direct child process.

## Problem

Korri currently has useful lifecycle pieces, but they are split by implementation path:

- local launches are increasingly modeled through sessiond managed-launch status;
- remote streaming has a prepare/intent handoff plus local Moonlight launch;
- Steam launches can involve a launcher process that exits before the real game, plus Gamescope and Steam-owned child processes;
- inputd and operator tooling still need tactical fallbacks when a launch path does not fit the simple direct-child model.

That split leaks into product behavior. A user asks to launch or stop "the game," not "the local foreground child" or "the remote stream intent." The UI should show one lifecycle. Hardware buttons should call one stop API. Diagnostics should attach to one session id.

## Goals

- Make **remote vs local** a lifecycle implementation detail, not a UI/control-plane distinction.
- Give every foreground experience one durable `foregroundSessionId` from prepare/launch through stop/restore.
- Normalize lifecycle vocabulary across local process, Steam AppID, emulator, and remote-stream sessions.
- Let sessiond, or its successor supervisor, own stop/restore/residual-reaping semantics for all foreground session types.
- Preserve implementation-specific metadata as diagnostics, not as top-level product states.
- Keep launch acceptance and lifetime observation separate: an API can acknowledge that a session was accepted while the lifecycle supervisor continues tracking the actual foreground experience.

## Non-Goals

- Replacing Steam, Sunshine, Moonlight, or emulator-specific launch mechanics.
- Hiding implementation diagnostics from operators. Details should remain available as attached artifacts/events.
- Requiring every runtime to have identical child-process structure.
- Solving Steam diagnostic capture in this item; link to the dedicated Steam observability backlog item for launch-scoped artifacts.

## Target Lifecycle Vocabulary

The product-facing state machine should be linear enough for UI and controls while allowing implementation-specific sub-phases:

```text
Idle
  → Preparing
  → Launching
  → Running
  → Stopping
  → Restoring
  → Idle
```

Failure/recovery path:

```text
Preparing/Launching/Running/Stopping/Restoring
  → Failed
  → Recovering
  → Idle
```

Remote streaming should fit the same model:

```text
Preparing   = resolve remote game + write remote intent + prepare local client
Launching   = remote host starts game and local Moonlight connects
Running     = foreground experience is active; implementation may include remote game + local stream client
Stopping    = terminate local stream client and/or remote foreground session
Restoring   = return local and remote hosts to their ready/home state
```

Steam should fit the same model:

```text
Preparing   = repair/materialize Steam LaunchOptions and runtime state
Launching   = Steam AppID accepted; launcher/Gamescope starting
Running     = actual foreground game or anchored Steam session active
Stopping    = terminate foreground Steam game/session
Restoring   = reap residuals, restore UI/compositor/session readiness
```

## Public Shape Sketch

A future status surface should look conceptually like:

```ts
type ForegroundSessionStatus = {
  state:
    | "Idle"
    | "Preparing"
    | "Launching"
    | "Running"
    | "Stopping"
    | "Restoring"
    | "Failed"
    | "Recovering"
  foregroundSessionId?: string
  active?: {
    appId?: string
    gameId?: string
    title?: string
    sourceHost?: string
    transport?: "local" | "remote-stream"
    runtime?: "steam" | "emulator" | "native" | "moonlight" | "other"
  }
  phase?: string
  failure?: {
    stage: string
    message: string
  }
  diagnostics?: {
    artifactRoot?: string
    eventIds?: readonly string[]
  }
}
```

The `transport` and `runtime` fields are metadata. They must not change the UI/control contract for stop, readiness, or failure handling.

## Current Anchors

- `product/services/device/sessiond.ts` owns the strongest current lifecycle implementation.
- `product/platform/library/sessiond-managed-launch-protocol.ts` defines the current managed-launch mode/event protocol.
- `product/platform/library/sessiond-lifecycle-projections.ts` maps sessiond into UI-facing foreground session states.
- `product/services/device/game-stream-launch-intent.ts` carries remote-stream handoff identity and launch specs.
- `product/services/device/game-stream-runner.ts` has the older game-stream runner lifecycle and sessiond delegation path.
- `product/platform/stream/foreground-session-gate-state.ts` is the current UI gate projection.

## Success Criteria

- The portal/home UI consumes one foreground-session status source for local, Steam, emulator, and remote-stream launches.
- The hardware/button stop path calls one foreground-session stop API.
- Remote-stream launch does not expose a separate lifecycle to UI code; remote details are metadata/artifacts.
- Steam launcher-exits-before-game and emulator direct-child launches share the same running/stopping/restoring contract.
- Session status remains active until the actual foreground experience is gone or intentionally anchored.
- Every foreground session has a durable id that ties together launch request, lifecycle events, stop request, and diagnostics.
- Tests cover local direct child, Steam launcher-anchor, and remote stream under the same lifecycle projection and stop API.

## Related Work

- Backlog: `work/items/parking-lot/01KV3A5RNCMMGR8FY5Y8MKPWGD-normalize-all-foreground-launches-under-one-lifecycle-superv.md`
- Steam diagnostics backlog: `work/items/parking-lot/01KV3KWT98Y6W6CNXP05ZPSHH7-capture-steam-launch-diagnostics-as-first-class-session-arti.md`
