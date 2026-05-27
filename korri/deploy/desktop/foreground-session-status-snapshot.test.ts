import { describe, expect, it } from "bun:test"
import { decodeForegroundSessionStatusSnapshot } from "@shared/stream/foreground-session-status"
import {
  createForegroundSessionEvent,
  foregroundSessionState,
} from "@shared/stream/foreground-session-lifecycle"
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

  it("preserves last terminal and readiness summaries after idle release", () => {
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
    expect(snapshot.lastReadiness).toEqual({
      requestId: "request-1",
      status: "failed",
      stage: "verifyReady",
      gate: "surface-absence",
      message: "still visible",
    })
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
