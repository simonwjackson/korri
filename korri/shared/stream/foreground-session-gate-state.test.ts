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
