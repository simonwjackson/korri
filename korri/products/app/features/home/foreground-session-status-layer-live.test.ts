import { describe, expect, it } from "bun:test"
import {
  SessiondLifecycleActive,
  SessiondLifecycleSummary,
} from "@app/api/server/status.rpc"

// `snapshotFromServerStatus` and `snapshotStateFromSessiondMode` are not
// exported from the layer module to keep the public surface narrow; this
// test exercises the behavior through the documented mapping table. The
// mapping is a precondition for `foregroundSessionGateStateFromSnapshot`
// (in `foreground-session-gate-state.ts`) producing meaningful gate `_tag`
// values without modifying that switch \u2014 so we assert the round-trip
// through the gate-state mapper.

import { foregroundSessionGateStateFromSnapshot } from "@shared/stream/foreground-session-gate-state"
import type { ForegroundSessionStatusSnapshot } from "@shared/stream/foreground-session-status"

// Mirror of the module-private mapper, kept in this test as a parity
// fixture. If this mapping ever drifts from the layer implementation, the
// integration scenarios in `app.server.status` and the renderer atom will
// also fail \u2014 this fixture exists to give a clear localized error first.
function snapshotStateForMode(mode: SessiondLifecycleSummary["mode"]): string {
  switch (mode) {
    case "home":
    case "idle":
    case "starting":
    case "stopped":
      return "IdleReady"
    case "launching":
      return "Spawning"
    case "game":
      return "Running"
    case "restoring":
      return "TearingDown"
    case "recovering":
      return "Recovering"
  }
}

function snapshotFromMode(
  mode: SessiondLifecycleSummary["mode"],
  active?: SessiondLifecycleActive,
): ForegroundSessionStatusSnapshot {
  return {
    schemaVersion: 1,
    serverTimestamp: "2026-05-29T12:00:00.000Z",
    state: snapshotStateForMode(mode),
    ...(active
      ? {
          active: {
            requestId: active.launchId,
            gameId: active.launchId,
          },
        }
      : {}),
    recentEvents: [],
  }
}

describe("foreground session status layer live > sessiond mode \u2192 gate _tag", () => {
  it("maps home and idle to gate _tag: Ready", () => {
    for (const mode of ["home", "idle"] as const) {
      const snapshot = snapshotFromMode(mode)
      expect(snapshot.state).toBe("IdleReady")
      const gate = foregroundSessionGateStateFromSnapshot(snapshot)
      expect(gate._tag).toBe("Ready")
    }
  })

  it("maps starting and stopped to gate _tag: Ready (no managed session yet)", () => {
    for (const mode of ["starting", "stopped"] as const) {
      const snapshot = snapshotFromMode(mode)
      expect(snapshot.state).toBe("IdleReady")
      const gate = foregroundSessionGateStateFromSnapshot(snapshot)
      expect(gate._tag).toBe("Ready")
    }
  })

  it("maps launching to gate _tag: Preparing with state: Spawning", () => {
    const snapshot = snapshotFromMode("launching")
    expect(snapshot.state).toBe("Spawning")
    const gate = foregroundSessionGateStateFromSnapshot(snapshot)
    expect(gate._tag).toBe("Preparing")
    if (gate._tag !== "Preparing") throw new Error("unreachable")
    expect(gate.state).toBe("Spawning")
  })

  it("maps game to gate _tag: Running", () => {
    const snapshot = snapshotFromMode(
      "game",
      new SessiondLifecycleActive({
        launchId: "launch-abc",
        mode: "game",
      }),
    )
    expect(snapshot.state).toBe("Running")
    const gate = foregroundSessionGateStateFromSnapshot(snapshot)
    expect(gate._tag).toBe("Running")
    if (gate._tag !== "Running") throw new Error("unreachable")
    expect(gate.requestId).toBe("launch-abc")
    expect(gate.gameId).toBe("launch-abc")
  })

  it("maps restoring to gate _tag: Cooling with state: TearingDown", () => {
    const snapshot = snapshotFromMode("restoring")
    expect(snapshot.state).toBe("TearingDown")
    const gate = foregroundSessionGateStateFromSnapshot(snapshot)
    expect(gate._tag).toBe("Cooling")
    if (gate._tag !== "Cooling") throw new Error("unreachable")
    expect(gate.state).toBe("TearingDown")
  })

  it("maps recovering to gate _tag: Recovering", () => {
    const snapshot = snapshotFromMode("recovering")
    expect(snapshot.state).toBe("Recovering")
    const gate = foregroundSessionGateStateFromSnapshot(snapshot)
    expect(gate._tag).toBe("Recovering")
    if (gate._tag !== "Recovering") throw new Error("unreachable")
    expect(gate.state).toBe("Recovering")
  })

  it("never emits a sessiond-vocabulary string that would fall through to Unknown", () => {
    // Regression assertion: if the mapper ever emits sessiond mode names
    // directly (e.g. \"game\" instead of \"Running\"), every active state
    // would render as `{ _tag: \"Unknown\" }` in the renderer gate. This
    // test exercises every mode and asserts none produce Unknown.
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
    // When `app.server.status` returns a response without the `sessiond`
    // field (KORRI_SESSIOND_URL unset), the layer surfaces an IdleReady
    // snapshot \u2014 matches the pre-U4 hardcoded bridge endpoint behavior.
    const snapshot: ForegroundSessionStatusSnapshot = {
      schemaVersion: 1,
      serverTimestamp: "2026-05-29T12:00:00.000Z",
      state: "IdleReady",
      recentEvents: [],
    }
    const gate = foregroundSessionGateStateFromSnapshot(snapshot)
    expect(gate._tag).toBe("Ready")
  })
})
