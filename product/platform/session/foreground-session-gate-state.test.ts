import { describe, expect, it } from "bun:test"
import { foregroundSessionGateStateFromSnapshot } from "./foreground-session-gate-state"

describe("foreground session gate state", () => {
  const base = {
    schemaVersion: 1 as const,
    serverTimestamp: "2026-05-26T12:00:00.000Z",
    recentEvents: [],
  }

  it("maps idle-ready to ready", () => {
    expect(
      foregroundSessionGateStateFromSnapshot({ ...base, state: "IdleReady" }),
    ).toEqual({ _tag: "Ready" })
  })

  it("maps launch startup states to preparing", () => {
    for (const state of ["Preparing", "Spawning", "Foregrounding"] as const) {
      expect(
        foregroundSessionGateStateFromSnapshot({
          ...base,
          state,
          active: { requestId: "request-1", gameId: "gba/wario-land-4" },
        }),
      ).toEqual({
        _tag: "Preparing",
        state,
        requestId: "request-1",
        gameId: "gba/wario-land-4",
      })
    }
  })

  it("maps running to a running-session explanation", () => {
    expect(
      foregroundSessionGateStateFromSnapshot({
        ...base,
        state: "Running",
        active: { requestId: "request-1", gameId: "gba/wario-land-4" },
      }),
    ).toEqual({
      _tag: "Running",
      requestId: "request-1",
      gameId: "gba/wario-land-4",
    })
  })

  it("maps post-exit readiness states to cooling", () => {
    for (const state of [
      "ExitObserved",
      "TearingDown",
      "VerifyingReady",
    ] as const) {
      expect(
        foregroundSessionGateStateFromSnapshot({
          ...base,
          state,
          active: { requestId: "request-1", gameId: "gba/wario-land-4" },
        }),
      ).toEqual({
        _tag: "Cooling",
        state,
        requestId: "request-1",
        gameId: "gba/wario-land-4",
      })
    }
  })

  it("maps failed to recovery with summary", () => {
    expect(
      foregroundSessionGateStateFromSnapshot({
        ...base,
        state: "Failed",
        lastFailure: {
          requestId: "request-1",
          gameId: "gba/wario-land-4",
          stage: "readiness",
          message: "surface remained visible",
        },
      }),
    ).toEqual({
      _tag: "Recovering",
      state: "Failed",
      requestId: "request-1",
      gameId: "gba/wario-land-4",
      stage: "readiness",
      message: "surface remained visible",
    })
  })

  it("maps recovering to recovery with summary", () => {
    expect(
      foregroundSessionGateStateFromSnapshot({
        ...base,
        state: "Recovering",
        lastFailure: {
          requestId: "request-1",
          gameId: "gba/wario-land-4",
          stage: "readiness",
          message: "surface remained visible",
        },
      }),
    ).toEqual({
      _tag: "Recovering",
      state: "Recovering",
      requestId: "request-1",
      gameId: "gba/wario-land-4",
      stage: "readiness",
      message: "surface remained visible",
    })
  })

  it("forwards the new `restore` failure stage onto the gate state", () => {
    // task-017 introduced `restore` as a distinct failure stage for
    // Recovering states. The gate state's `stage` field is a loose
    // string passthrough; this test pins the contract so an operator UI
    // can render "restore failed" specifically without the field being
    // collapsed into "teardown".
    expect(
      foregroundSessionGateStateFromSnapshot({
        ...base,
        state: "Recovering",
        lastFailure: {
          requestId: "request-r",
          gameId: "snes/echo.smc",
          stage: "restore",
          message: "sessiond restore failed",
        },
      }),
    ).toEqual({
      _tag: "Recovering",
      state: "Recovering",
      requestId: "request-r",
      gameId: "snes/echo.smc",
      stage: "restore",
      message: "sessiond restore failed",
    })
  })

  it("never reports Recovering or Failed snapshots as Ready (restore safety)", () => {
    // Regression guard for the task-017 acceptance criterion: a restore
    // failure must NEVER surface as `_tag: "Ready"`. Any UI consumer
    // gating user-visible launch on `_tag === "Ready"` would otherwise
    // ignore the unhealthy state and re-allow launches mid-recovery.
    for (const snapshotState of ["Failed", "Recovering"] as const) {
      const gate = foregroundSessionGateStateFromSnapshot({
        ...base,
        state: snapshotState,
      })
      expect(gate._tag).not.toBe("Ready")
    }
  })

  it("maps unknown future state tags to unknown", () => {
    expect(
      foregroundSessionGateStateFromSnapshot({
        ...base,
        state: "Queued",
      }),
    ).toEqual({ _tag: "Unknown", state: "Queued" })
  })

  it("keeps transport failures non-blocking as load error", () => {
    expect(
      foregroundSessionGateStateFromSnapshot({
        _tag: "LoadError",
        message: "HTTP 500",
      }),
    ).toEqual({ _tag: "LoadError", message: "HTTP 500" })
  })
})
