import { describe, expect, it } from "bun:test"
import { foregroundSessionGateStateFromSnapshot } from "@platform/stream/foreground-session-gate-state"
import { SessiondLifecycleActive } from "@product/apps/portal/api/server/status.rpc"
import {
  snapshotFromServerStatus,
  snapshotStateFromSessiondMode,
} from "@product/apps/portal/features/home/foreground-session-status-layer-live"

// `snapshotStateFromSessiondMode` is the U4 mapping table; the gate-state
// switch in `foreground-session-gate-state.ts` consumes its output. These
// tests assert each row of the mapping plus the round-trip through the
// gate-state mapper so a single localized failure points at the vocabulary
// drift.

const SERVER_ID = "test-server"

function snapshotFromMode(
  mode: Parameters<typeof snapshotStateFromSessiondMode>[0],
  active?: SessiondLifecycleActive,
) {
  // Build the snapshot via the layer's real `snapshotFromServerStatus`
  // helper so the test exercises the production mapping, not a fixture.
  return snapshotFromServerStatus(
    {
      mode,
      restoreAttempts: 0,
      ...(active ? { active } : {}),
    } as Parameters<typeof snapshotFromServerStatus>[0],
    SERVER_ID,
  )
}

describe("foreground session status layer live > sessiond mode → gate _tag", () => {
  it("maps home and idle to gate _tag: Ready", () => {
    for (const mode of ["home", "idle"] as const) {
      expect(snapshotStateFromSessiondMode(mode)).toBe("IdleReady")
      const snapshot = snapshotFromMode(mode)
      expect(snapshot.state).toBe("IdleReady")
      const gate = foregroundSessionGateStateFromSnapshot(snapshot)
      expect(gate._tag).toBe("Ready")
    }
  })

  it("maps starting and stopped to gate _tag: Ready (no managed session yet)", () => {
    for (const mode of ["starting", "stopped"] as const) {
      expect(snapshotStateFromSessiondMode(mode)).toBe("IdleReady")
      const snapshot = snapshotFromMode(mode)
      const gate = foregroundSessionGateStateFromSnapshot(snapshot)
      expect(gate._tag).toBe("Ready")
    }
  })

  it("maps launching to gate _tag: Preparing with state: Spawning", () => {
    expect(snapshotStateFromSessiondMode("launching")).toBe("Spawning")
    const snapshot = snapshotFromMode("launching")
    const gate = foregroundSessionGateStateFromSnapshot(snapshot)
    expect(gate._tag).toBe("Preparing")
    if (gate._tag !== "Preparing") throw new Error("unreachable")
    expect(gate.state).toBe("Spawning")
  })

  it("maps game to gate _tag: Running and forwards active.launchId", () => {
    expect(snapshotStateFromSessiondMode("game")).toBe("Running")
    const snapshot = snapshotFromMode(
      "game",
      new SessiondLifecycleActive({
        launchId: "launch-abc",
        mode: "game",
      }),
    )
    const gate = foregroundSessionGateStateFromSnapshot(snapshot)
    expect(gate._tag).toBe("Running")
    if (gate._tag !== "Running") throw new Error("unreachable")
    expect(gate.requestId).toBe("launch-abc")
    expect(gate.gameId).toBe("launch-abc")
  })

  it("maps restoring to gate _tag: Cooling with state: TearingDown", () => {
    expect(snapshotStateFromSessiondMode("restoring")).toBe("TearingDown")
    const snapshot = snapshotFromMode("restoring")
    const gate = foregroundSessionGateStateFromSnapshot(snapshot)
    expect(gate._tag).toBe("Cooling")
    if (gate._tag !== "Cooling") throw new Error("unreachable")
    expect(gate.state).toBe("TearingDown")
  })

  it("maps recovering to gate _tag: Recovering", () => {
    expect(snapshotStateFromSessiondMode("recovering")).toBe("Recovering")
    const snapshot = snapshotFromMode("recovering")
    const gate = foregroundSessionGateStateFromSnapshot(snapshot)
    expect(gate._tag).toBe("Recovering")
    if (gate._tag !== "Recovering") throw new Error("unreachable")
    expect(gate.state).toBe("Recovering")
  })

  it("never emits a sessiond-vocabulary string that would fall through to Unknown", () => {
    // Regression guard: if the mapper ever emits sessiond mode names
    // directly (e.g. "game" instead of "Running"), every active state
    // would render as `{ _tag: "Unknown" }` in the renderer gate.
    const allModes = [
      "home",
      "idle",
      "starting",
      "stopped",
      "launching",
      "game",
      "restoring",
      "recovering",
    ] as const
    for (const mode of allModes) {
      const snapshot = snapshotFromMode(mode)
      const gate = foregroundSessionGateStateFromSnapshot(snapshot)
      expect(gate._tag).not.toBe("Unknown")
    }
  })

  it("falls back to IdleReady when sessiond is not configured (no sessiond field)", () => {
    // `app.server.status` may return without the `sessiond` field when
    // KORRI_SESSIOND_SOCKET is unset. The layer surfaces an IdleReady
    // snapshot — same effective behavior as the pre-U4 bridge endpoint.
    const snapshot = snapshotFromServerStatus(undefined, SERVER_ID)
    expect(snapshot.state).toBe("IdleReady")
    expect(snapshot.active).toBeUndefined()
    const gate = foregroundSessionGateStateFromSnapshot(snapshot)
    expect(gate._tag).toBe("Ready")
  })

  it("threads sessiond.failureReason into snapshot.lastFailure", () => {
    const snapshot = snapshotFromServerStatus(
      {
        mode: "recovering",
        restoreAttempts: 1,
        failureReason: "renderer crash",
      } as Parameters<typeof snapshotFromServerStatus>[0],
      SERVER_ID,
    )
    expect(snapshot.lastFailure).toEqual({
      stage: "sessiond",
      message: "renderer crash",
    })
  })
})
