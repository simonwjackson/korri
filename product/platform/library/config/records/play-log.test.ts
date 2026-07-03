import { describe, expect, it } from "bun:test"

import { decodePlayEntry, decodePlayLog, emptyPlayLog } from "./play-log"

describe("PlayLog", () => {
  it("decodes a (user, game) log, parsing occurredAt from an ISO string", () => {
    const log = decodePlayLog({
      userId: "alice",
      gameId: "snes/f-zero",
      entries: [
        {
          occurredAt: "2026-07-01T20:44:00.000Z",
          durationSeconds: 5400,
          releaseId: "steam",
        },
        { occurredAt: "2026-06-20T14:02:00.000Z", durationSeconds: 2100 },
      ],
    })
    expect(log.userId).toBe("alice")
    expect(log.gameId).toBe("snes/f-zero")
    expect(log.entries).toHaveLength(2)
    expect(log.entries[0]?.occurredAt).toBeInstanceOf(Date)
    expect(log.entries[0]?.occurredAt.toISOString()).toBe(
      "2026-07-01T20:44:00.000Z",
    )
    expect(log.entries[0]?.durationSeconds).toBe(5400)
    expect(log.entries[0]?.releaseId).toBe("steam")
  })

  it("decodes a log with no entries", () => {
    const log = decodePlayLog({
      userId: "alice",
      gameId: "snes/f-zero",
      entries: [],
    })
    expect(log.entries).toHaveLength(0)
  })

  it("rejects an entry with an unknown key", () => {
    expect(() =>
      decodePlayEntry({
        occurredAt: "2026-07-01T20:44:00.000Z",
        durationSeconds: 10,
        playcount: 3,
      }),
    ).toThrow()
  })

  it("builds an empty log for a (user, game)", () => {
    expect(emptyPlayLog({ userId: "alice", gameId: "snes/f-zero" })).toEqual({
      userId: "alice",
      gameId: "snes/f-zero",
      entries: [],
    })
  })
})
