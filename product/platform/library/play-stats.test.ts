import { describe, expect, it } from "bun:test"

import type { PlayEntry } from "./config/records/play-log"
import {
  DEFAULT_PLAY_LOG_THRESHOLD_SECONDS,
  derivePlayStats,
  qualifiesForPlayLog,
} from "./play-stats"

const entry = (iso: string, durationSeconds: number): PlayEntry => ({
  occurredAt: new Date(iso),
  durationSeconds,
})

describe("derivePlayStats", () => {
  it("reads never-played from an empty log (AE3)", () => {
    expect(derivePlayStats([])).toEqual({
      playCount: 0,
      totalPlaytimeSeconds: 0,
    })
  })

  it("derives stats from a single entry (AE1)", () => {
    const stats = derivePlayStats([entry("2026-07-01T20:44:00.000Z", 2100)])
    expect(stats.lastPlayed?.toISOString()).toBe("2026-07-01T20:44:00.000Z")
    expect(stats.playCount).toBe(1)
    expect(stats.totalPlaytimeSeconds).toBe(2100)
  })

  it("derives last-played, count, and total across many entries", () => {
    const stats = derivePlayStats([
      entry("2026-06-20T14:02:00.000Z", 2100),
      entry("2026-07-01T20:44:00.000Z", 5400),
      entry("2026-06-22T09:10:00.000Z", 180),
    ])
    expect(stats.lastPlayed?.toISOString()).toBe("2026-07-01T20:44:00.000Z")
    expect(stats.playCount).toBe(3)
    expect(stats.totalPlaytimeSeconds).toBe(7680)
  })
})

describe("qualifiesForPlayLog", () => {
  it("admits any session at the default threshold of 0 (AE1)", () => {
    expect(DEFAULT_PLAY_LOG_THRESHOLD_SECONDS).toBe(0)
    expect(qualifiesForPlayLog(0)).toBe(true)
    expect(qualifiesForPlayLog(1)).toBe(true)
  })

  it("rejects sub-threshold sessions when a threshold is set (AE2)", () => {
    expect(qualifiesForPlayLog(30, 120)).toBe(false)
    expect(qualifiesForPlayLog(120, 120)).toBe(true)
    expect(qualifiesForPlayLog(121, 120)).toBe(true)
  })
})
