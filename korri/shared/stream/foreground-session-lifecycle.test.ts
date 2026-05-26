import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  acceptForegroundSessionLaunch,
  createForegroundSessionEvent,
  type ForegroundSessionState,
  foregroundSessionBusyRejection,
  foregroundSessionState,
  foregroundSessionTransition,
  isForegroundSessionLaunchAccepting,
} from "./foreground-session-lifecycle"

const REQUEST = {
  requestId: "launch-1",
  gameId: "gba/wario-land-4",
  hostId: "aka",
}

const NON_IDLE_STATES: readonly ForegroundSessionState[] = [
  foregroundSessionState.preparing({ active: REQUEST }),
  foregroundSessionState.spawning({ active: REQUEST }),
  foregroundSessionState.foregrounding({ active: REQUEST }),
  foregroundSessionState.running({
    active: { ...REQUEST, child: { id: "child-1", processId: 4242 } },
  }),
  foregroundSessionState.exitObserved({
    active: {
      ...REQUEST,
      child: { id: "child-1", processId: 4242 },
      terminal: { _tag: "Exited", exitCode: 0 },
    },
  }),
  foregroundSessionState.tearingDown({ active: REQUEST }),
  foregroundSessionState.verifyingReady({ active: REQUEST }),
  foregroundSessionState.failed({
    active: REQUEST,
    failure: { stage: "prepare", message: "prepare failed" },
  }),
  foregroundSessionState.recovering({
    active: REQUEST,
    failure: { stage: "spawn", message: "spawn failed" },
  }),
]

describe("foreground session lifecycle", () => {
  it("accepts a new launch from idle-ready and records request/game identity", () => {
    const result = acceptForegroundSessionLaunch(
      foregroundSessionState.idleReady(),
      REQUEST,
    )

    expect(result._tag).toBe("Accepted")
    if (result._tag === "Accepted") {
      expect(result.state._tag).toBe("Preparing")
      expect(result.active.requestId).toBe("launch-1")
      expect(result.active.gameId).toBe("gba/wario-land-4")
      expect(result.event._tag).toBe("ForegroundSessionLaunchAccepted")
      expect(result.event.requestId).toBe("launch-1")
    }
  })

  it("rejects every non-idle state with a busy/not-ready result", () => {
    for (const state of NON_IDLE_STATES) {
      expect(isForegroundSessionLaunchAccepting(state)).toBe(false)

      const result = acceptForegroundSessionLaunch(state, {
        requestId: "launch-2",
        gameId: "gba/metroid-fusion",
      })

      expect(result._tag).toBe("Rejected")
      if (result._tag === "Rejected") {
        expect(result.rejection.category).toBe("session-busy")
        expect(result.rejection.currentState).toBe(state._tag)
      }
    }
  })

  it("preserves the current active session identity in busy rejection data", () => {
    const state = foregroundSessionState.running({
      active: { ...REQUEST, sessionId: "stream-session-1" },
    })

    const rejection = foregroundSessionBusyRejection(state, {
      requestId: "launch-2",
      gameId: "gba/metroid-fusion",
    })

    expect(rejection).toMatchObject({
      category: "session-busy",
      attemptedRequestId: "launch-2",
      currentRequestId: "launch-1",
      currentGameId: "gba/wario-land-4",
      currentSessionId: "stream-session-1",
      currentState: "Running",
    })
  })

  it("records transition events with previous and next state plus generic evidence", () => {
    const preparing = foregroundSessionState.preparing({ active: REQUEST })
    const spawning = foregroundSessionTransition(preparing, "Spawning", {
      evidence: { stage: "prepare", status: "ok", detail: "host prepared" },
    })

    expect(spawning.state._tag).toBe("Spawning")
    expect(spawning.event).toMatchObject({
      _tag: "ForegroundSessionStateChanged",
      previousState: "Preparing",
      nextState: "Spawning",
      requestId: "launch-1",
      evidence: { stage: "prepare", status: "ok", detail: "host prepared" },
    })
  })

  it("treats failed and recovering states as not launch-accepting", () => {
    const failed = foregroundSessionState.failed({
      active: REQUEST,
      failure: { stage: "foreground", message: "surface repair failed" },
    })
    const recovering = foregroundSessionState.recovering({
      active: REQUEST,
      failure: { stage: "cleanup", message: "cleanup failed" },
    })

    expect(isForegroundSessionLaunchAccepting(failed)).toBe(false)
    expect(isForegroundSessionLaunchAccepting(recovering)).toBe(false)
  })

  it("creates adapter-generic lifecycle events", () => {
    const event = createForegroundSessionEvent({
      _tag: "ForegroundSessionAdapterOutcome",
      requestId: "launch-1",
      stage: "spawn",
      status: "ok",
      evidence: { command: "generic-wrapper", processId: 4242 },
    })

    expect(event).toEqual({
      _tag: "ForegroundSessionAdapterOutcome",
      requestId: "launch-1",
      stage: "spawn",
      status: "ok",
      evidence: { command: "generic-wrapper", processId: 4242 },
    })
  })

  it("stays pure and independent from product/deploy/runtime-specific modules", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "korri/shared/stream/foreground-session-lifecycle.ts",
      ),
      "utf8",
    )

    expect(source).not.toContain("@app/")
    expect(source).not.toContain("korri/deploy")
    expect(source).not.toContain("Bun")
    expect(source).not.toMatch(/moonlight/i)
    expect(source).not.toMatch(/sway/i)
  })
})
