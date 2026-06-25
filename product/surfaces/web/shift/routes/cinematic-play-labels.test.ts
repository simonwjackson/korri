import { describe, expect, it } from "bun:test"
import { playtimeLabel, relativeLastPlayed } from "./cinematic-play-labels"

describe("cinematic play labels", () => {
  const now = new Date("2026-06-24T12:00:00.000Z")

  it("formats recent play time relative to now", () => {
    expect(relativeLastPlayed(new Date("2026-06-24T09:00:00.000Z"), now)).toBe(
      "3h ago",
    )
    expect(relativeLastPlayed(new Date("2026-06-21T12:00:00.000Z"), now)).toBe(
      "3d ago",
    )
  })

  it("omits missing last played labels", () => {
    expect(relativeLastPlayed(undefined, now)).toBeUndefined()
  })

  it("formats playtime minutes as minutes or hours", () => {
    expect(playtimeLabel(45)).toBe("45m")
    expect(playtimeLabel(270)).toBe("4.5h")
  })

  it("omits missing or zero playtime labels", () => {
    expect(playtimeLabel(undefined)).toBeUndefined()
    expect(playtimeLabel(0)).toBeUndefined()
  })
})
