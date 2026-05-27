import { describe, expect, it } from "bun:test"
import {
  decodeForegroundSessionStatusSnapshot as decodeSnapshot,
  foregroundSessionGateStateFromStatusTag,
} from "./foreground-session-status"

describe("foreground session status snapshot", () => {
  it("accepts an idle-ready snapshot with no active session", () => {
    const decoded = decodeSnapshot({
      schemaVersion: 1,
      serverTimestamp: "2026-05-26T12:00:00.000Z",
      state: "IdleReady",
      recentEvents: [],
    })

    expect(decoded).toEqual({
      schemaVersion: 1,
      serverTimestamp: "2026-05-26T12:00:00.000Z",
      state: "IdleReady",
      recentEvents: [],
    })
  })

  it("accepts a running snapshot with active identity and sanitized events", () => {
    const decoded = decodeSnapshot({
      schemaVersion: 1,
      serverTimestamp: "2026-05-26T12:00:00.000Z",
      state: "Running",
      active: {
        requestId: "request-1",
        gameId: "gba/wario-land-4",
        hostId: "aka",
        sessionId: "stream-session-1",
        child: { id: "moonlight-1", processId: 4242 },
      },
      recentEvents: [
        {
          tag: "ForegroundSessionAdapterOutcome",
          requestId: "request-1",
          stage: "spawn",
          status: "ok",
        },
      ],
    })

    expect(decoded.active).toEqual({
      requestId: "request-1",
      gameId: "gba/wario-land-4",
      hostId: "aka",
      sessionId: "stream-session-1",
      child: { id: "moonlight-1", processId: 4242 },
    })
    expect(decoded.recentEvents).toEqual([
      {
        tag: "ForegroundSessionAdapterOutcome",
        requestId: "request-1",
        stage: "spawn",
        status: "ok",
      },
    ])
  })

  it("accepts a post-failure snapshot with terminal and readiness summaries", () => {
    const decoded = decodeSnapshot({
      schemaVersion: 1,
      serverTimestamp: "2026-05-26T12:00:00.000Z",
      state: "IdleReady",
      lastTerminal: {
        requestId: "request-1",
        gameId: "gba/wario-land-4",
        terminal: { tag: "Exited", exitCode: 0 },
      },
      lastFailure: {
        requestId: "request-1",
        gameId: "gba/wario-land-4",
        stage: "readiness",
        message: "surface remained visible",
      },
      lastReadiness: {
        requestId: "request-1",
        status: "failed",
        stage: "verifyReady",
        gate: "surface-absence",
        message: "surface remained visible",
      },
      recentEvents: [],
    })

    expect(decoded.lastTerminal?.terminal).toEqual({
      tag: "Exited",
      exitCode: 0,
    })
    expect(decoded.lastFailure?.stage).toBe("readiness")
    expect(decoded.lastReadiness?.gate).toBe("surface-absence")
  })

  it("represents repeated launches of the same game with distinct request ids", () => {
    const first = decodeSnapshot({
      schemaVersion: 1,
      serverTimestamp: "2026-05-26T12:00:00.000Z",
      state: "Running",
      active: { requestId: "request-1", gameId: "gba/wario-land-4" },
      recentEvents: [],
    })
    const second = decodeSnapshot({
      schemaVersion: 1,
      serverTimestamp: "2026-05-26T12:00:01.000Z",
      state: "Running",
      active: { requestId: "request-2", gameId: "gba/wario-land-4" },
      recentEvents: [],
    })

    expect(first.active?.gameId).toBe(second.active?.gameId)
    expect(first.active?.requestId).not.toBe(second.active?.requestId)
  })

  it("rejects malformed timestamps", () => {
    expect(() =>
      decodeSnapshot({
        schemaVersion: 1,
        serverTimestamp: "not-a-date",
        state: "IdleReady",
        recentEvents: [],
      }),
    ).toThrow(/serverTimestamp/)
  })

  it("rejects raw free-form evidence in public event summaries", () => {
    expect(() =>
      decodeSnapshot({
        schemaVersion: 1,
        serverTimestamp: "2026-05-26T12:00:00.000Z",
        state: "Running",
        active: { requestId: "request-1", gameId: "gba/wario-land-4" },
        recentEvents: [
          {
            tag: "ForegroundSessionAdapterOutcome",
            requestId: "request-1",
            stage: "spawn",
            status: "ok",
            evidence: { argv: ["moonlight", "stream"], env: { SECRET: "x" } },
          },
        ],
      }),
    ).toThrow(/evidence/)
  })

  it("decodes unknown future lifecycle tags for renderer safety", () => {
    const decoded = decodeSnapshot({
      schemaVersion: 1,
      serverTimestamp: "2026-05-26T12:00:00.000Z",
      state: "Queued",
      recentEvents: [
        {
          tag: "ForegroundSessionStateChanged",
          previousState: "IdleReady",
          nextState: "Queued",
        },
      ],
    })

    expect(decoded.state).toBe("Queued")
    expect(foregroundSessionGateStateFromStatusTag(decoded.state)).toEqual({
      _tag: "Unknown",
      state: "Queued",
    })
  })

  it("maps known lifecycle tags for renderer safety helpers", () => {
    expect(foregroundSessionGateStateFromStatusTag("Running")).toEqual({
      _tag: "Known",
      state: "Running",
    })
  })
})
