import { describe, expect, it } from "bun:test"

import { decodePlayEntry, decodePlayLog, emptyPlayLog } from "./play-log"

describe("PlayLog", () => {
  it("decodes a log with entries, parsing occurredAt from an ISO string", () => {
    const log = decodePlayLog({
      playableId: "snes/f-zero",
      entries: [
        { occurredAt: "2026-07-01T20:44:00.000Z", durationSeconds: 5400 },
        { occurredAt: "2026-06-20T14:02:00.000Z", durationSeconds: 2100 },
      ],
    })
    expect(log.playableId).toBe("snes/f-zero")
    expect(log.entries).toHaveLength(2)
    expect(log.entries[0]?.occurredAt).toBeInstanceOf(Date)
    expect(log.entries[0]?.occurredAt.toISOString()).toBe(
      "2026-07-01T20:44:00.000Z",
    )
    expect(log.entries[0]?.durationSeconds).toBe(5400)
  })

  it("decodes a log with no entries", () => {
    const log = decodePlayLog({ playableId: "snes/f-zero", entries: [] })
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

  it("builds an empty log for a playable", () => {
    expect(emptyPlayLog("snes/f-zero")).toEqual({
      playableId: "snes/f-zero",
      entries: [],
    })
  })
})
