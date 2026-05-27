import { describe, expect, it } from "bun:test"
import {
  createForegroundSessionEvent,
  foregroundSessionState,
} from "@shared/stream/foreground-session-lifecycle"
import { decodeForegroundSessionStatusSnapshot } from "@shared/stream/foreground-session-status"
import { foregroundSessionStatusSnapshotFromOwnerStatus } from "./foreground-session-status-snapshot"

const ACTIVE = {
  requestId: "request-1",
  gameId: "gba/wario-land-4",
  hostId: "aka",
  sessionId: "stream-session-1",
  child: { id: "moonlight-1", processId: 4242 },
}

describe("foreground session status snapshot adapter", () => {
  it("adapts a running owner status to a sanitized public snapshot", () => {
    const snapshot = foregroundSessionStatusSnapshotFromOwnerStatus({
      status: {
        state: foregroundSessionState.running({ active: ACTIVE }),
        events: [
          createForegroundSessionEvent({
            _tag: "ForegroundSessionAdapterOutcome",
            requestId: "request-1",
            stage: "spawn",
            status: "ok",
            evidence: { argv: ["moonlight", "stream"], processId: 4242 },
          }),
        ],
      },
      now: new Date("2026-05-26T12:00:00.000Z"),
    })

    expect(decodeForegroundSessionStatusSnapshot(snapshot)).toEqual(snapshot)
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      serverTimestamp: "2026-05-26T12:00:00.000Z",
      state: "Running",
      active: ACTIVE,
      recentEvents: [
        {
          tag: "ForegroundSessionAdapterOutcome",
          requestId: "request-1",
          stage: "spawn",
          status: "ok",
        },
      ],
    })
    expect(JSON.stringify(snapshot)).not.toContain("argv")
  })

  it("preserves last terminal, failure, and readiness summaries after idle release", () => {
    const snapshot = foregroundSessionStatusSnapshotFromOwnerStatus({
      status: {
        state: foregroundSessionState.idleReady(),
        events: [
          createForegroundSessionEvent({
            _tag: "ForegroundSessionLaunchAccepted",
            requestId: "request-1",
            gameId: "gba/wario-land-4",
          }),
          createForegroundSessionEvent({
            _tag: "ForegroundSessionExited",
            requestId: "request-1",
            terminal: { _tag: "Exited", exitCode: 0 },
            evidence: { ignored: "private" },
          }),
          createForegroundSessionEvent({
            _tag: "ForegroundSessionAdapterOutcome",
            requestId: "request-1",
            stage: "verifyReady",
            status: "failed",
            evidence: { gate: "surface-absence", message: "still visible" },
          }),
        ],
      },
      now: new Date("2026-05-26T12:00:00.000Z"),
    })

    expect(snapshot.state).toBe("IdleReady")
    expect(snapshot.lastTerminal).toEqual({
      requestId: "request-1",
      gameId: "gba/wario-land-4",
      terminal: { tag: "Exited", exitCode: 0 },
    })
    expect(snapshot.lastFailure).toEqual({
      requestId: "request-1",
      gameId: "gba/wario-land-4",
      stage: "verifyReady",
      message: "still visible",
    })
    expect(snapshot.lastReadiness).toEqual({
      requestId: "request-1",
      gameId: "gba/wario-land-4",
      status: "failed",
      stage: "verifyReady",
      gate: "surface-absence",
      message: "still visible",
    })
  })

  it("uses failed response messages when summarizing adapter failures", () => {
    const snapshot = foregroundSessionStatusSnapshotFromOwnerStatus({
      status: {
        state: foregroundSessionState.idleReady(),
        events: [
          createForegroundSessionEvent({
            _tag: "ForegroundSessionLaunchAccepted",
            requestId: "request-1",
            gameId: "gba/wario-land-4",
          }),
          createForegroundSessionEvent({
            _tag: "ForegroundSessionAdapterOutcome",
            requestId: "request-1",
            stage: "prepare",
            status: "failed",
            evidence: {
              response: {
                status: "failed",
                category: "prepare-failed",
                message: "host prepare failed",
              },
            },
          }),
        ],
      },
      now: new Date("2026-05-26T12:00:00.000Z"),
    })

    expect(snapshot.lastFailure).toEqual({
      requestId: "request-1",
      gameId: "gba/wario-land-4",
      stage: "prepare",
      message: "host prepare failed",
    })
  })

  it("uses a bounded default message when adapter failure evidence has no message", () => {
    const snapshot = foregroundSessionStatusSnapshotFromOwnerStatus({
      status: {
        state: foregroundSessionState.idleReady(),
        events: [
          createForegroundSessionEvent({
            _tag: "ForegroundSessionAdapterOutcome",
            requestId: "request-1",
            stage: "spawn",
            status: "failed",
            evidence: { code: 125 },
          }),
        ],
      },
      now: new Date("2026-05-26T12:00:00.000Z"),
    })

    expect(snapshot.lastFailure).toMatchObject({
      requestId: "request-1",
      stage: "spawn",
      message: "session failed",
    })
  })

  it("summarizes rejected launch events with attempted and current identity", () => {
    const snapshot = foregroundSessionStatusSnapshotFromOwnerStatus({
      status: {
        state: foregroundSessionState.running({ active: ACTIVE }),
        events: [
          createForegroundSessionEvent({
            _tag: "ForegroundSessionLaunchRejected",
            requestId: "request-2",
            gameId: "gba/metroid-fusion",
            rejection: {
              category: "session-busy",
              message: "Foreground session is not ready (Running)",
              attemptedRequestId: "request-2",
              attemptedGameId: "gba/metroid-fusion",
              currentState: "Running",
              currentRequestId: "request-1",
              currentGameId: "gba/wario-land-4",
            },
          }),
        ],
      },
      now: new Date("2026-05-26T12:00:00.000Z"),
    })

    expect(snapshot.recentEvents).toEqual([
      {
        tag: "ForegroundSessionLaunchRejected",
        requestId: "request-2",
        gameId: "gba/metroid-fusion",
        category: "session-busy",
        state: "Running",
        message: "Foreground session is not ready (Running)",
      },
    ])
  })

  it("does not carry stale readiness into a newer active launch", () => {
    const snapshot = foregroundSessionStatusSnapshotFromOwnerStatus({
      status: {
        state: foregroundSessionState.preparing({
          active: { requestId: "request-2", gameId: "gba/metroid-fusion" },
        }),
        events: [
          createForegroundSessionEvent({
            _tag: "ForegroundSessionAdapterOutcome",
            requestId: "request-1",
            stage: "verifyReady",
            status: "ok",
            evidence: { gate: "surface-absence" },
          }),
          createForegroundSessionEvent({
            _tag: "ForegroundSessionLaunchAccepted",
            requestId: "request-2",
            gameId: "gba/metroid-fusion",
          }),
        ],
      },
      now: new Date("2026-05-26T12:00:00.000Z"),
    })

    expect(snapshot.lastReadiness).toBeUndefined()
  })

  it("summarizes current failure state with active game identity", () => {
    const snapshot = foregroundSessionStatusSnapshotFromOwnerStatus({
      status: {
        state: foregroundSessionState.failed({
          active: ACTIVE,
          failure: {
            stage: "readiness",
            message: "surface remained visible",
            evidence: { raw: { nested: true } },
          },
        }),
        events: [],
      },
      now: new Date("2026-05-26T12:00:00.000Z"),
    })

    expect(snapshot.lastFailure).toEqual({
      requestId: "request-1",
      gameId: "gba/wario-land-4",
      stage: "readiness",
      message: "surface remained visible",
    })
    expect(JSON.stringify(snapshot)).not.toContain("nested")
  })
})
