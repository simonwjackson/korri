import { describe, expect, it } from "bun:test"
import type { ShiftGameDetailView } from "./ShiftGameDetailScreen"
import { shiftDetailPlayLabel, shiftDetailSynopsis } from "./shift-detail-copy"

const game = (
  extra: Partial<ShiftGameDetailView> = {},
): ShiftGameDetailView => ({
  id: "g",
  title: "Game",
  artUrl: "g.png",
  ...extra,
})

describe("shiftDetailPlayLabel", () => {
  it("says Continue once played, Play otherwise", () => {
    expect(shiftDetailPlayLabel(game({ lastPlayedLabel: "3h ago" }))).toBe(
      "Continue",
    )
    expect(shiftDetailPlayLabel(game())).toBe("Play")
  })
})

describe("shiftDetailSynopsis", () => {
  it("weaves genre and developer into the fallback", () => {
    const text = shiftDetailSynopsis(
      game({ genre: "Metroidvania", developer: "Team Cherry" }),
    )
    expect(text).toContain("metroidvania")
    expect(text).toContain("Team Cherry")
  })

  it("degrades gracefully when genre/developer are missing", () => {
    const text = shiftDetailSynopsis(game())
    expect(text).toContain("game")
    expect(text).toContain("an independent studio")
  })
})
