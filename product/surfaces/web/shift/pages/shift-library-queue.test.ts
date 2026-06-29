import { describe, expect, it } from "bun:test"
import type { ShiftLibraryGame } from "./shift-library-game"
import {
  deriveShiftLibraryQueue,
  promoteShiftLibraryLane,
  type ShiftLibraryLane,
  shiftLibraryLanes,
} from "./shift-library-queue"

const game = (
  id: string,
  extra: Partial<ShiftLibraryGame> = {},
): ShiftLibraryGame => ({
  id,
  title: id.toUpperCase(),
  artUrl: `${id}.png`,
  ...extra,
})

const games: readonly ShiftLibraryGame[] = [
  game("recent", { lastPlayedAt: 900 }),
  game("older", { lastPlayedAt: 100 }),
  game("starred", { favorite: true }),
  game("cold", {}),
]

describe("deriveShiftLibraryQueue", () => {
  it("puts the single most-recent game in Now, favorites in Up Next, rest in Backlog", () => {
    const assignment = deriveShiftLibraryQueue(games)

    expect(assignment.get("recent")).toBe("now")
    expect(assignment.get("starred")).toBe("next")
    expect(assignment.get("older")).toBe("backlog")
    expect(assignment.get("cold")).toBe("backlog")
  })

  it("keeps a favorite that is also most-recent in Now (not double-placed)", () => {
    const assignment = deriveShiftLibraryQueue([
      game("fav-recent", { lastPlayedAt: 900, favorite: true }),
      game("plain", { lastPlayedAt: 100 }),
    ])

    expect(assignment.get("fav-recent")).toBe("now")
  })
})

describe("shiftLibraryLanes", () => {
  it("groups in Now → Up Next → Backlog order, omitting empty lanes", () => {
    const lanes = shiftLibraryLanes(games, deriveShiftLibraryQueue(games))

    expect(lanes.map(lane => lane.id)).toEqual(["now", "next", "backlog"])
    expect(lanes.find(l => l.id === "backlog")?.games.map(g => g.id)).toEqual([
      "cold",
      "older",
    ]) // backlog is alphabetical by title (COLD, OLDER)
  })

  it("reflects a live assignment override", () => {
    const assignment = new Map<string, ShiftLibraryLane>([
      ["recent", "now"],
      ["cold", "next"],
    ])

    const next = shiftLibraryLanes(games, assignment).find(l => l.id === "next")

    expect(next?.games.map(g => g.id)).toContain("cold")
  })
})

describe("promoteShiftLibraryLane", () => {
  it("triages Backlog → Up Next → Now", () => {
    expect(promoteShiftLibraryLane("backlog")).toBe("next")
    expect(promoteShiftLibraryLane("next")).toBe("now")
    expect(promoteShiftLibraryLane("now")).toBe("now")
  })
})
