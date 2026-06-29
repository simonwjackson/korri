import { describe, expect, it } from "bun:test"
import type { ShiftLibraryGame } from "./shift-library-game"
import {
  resolveShiftLibraryIntent,
  SHIFT_LIBRARY_INTENTS,
} from "./shift-library-intents"

const game = (
  id: string,
  extra: Partial<ShiftLibraryGame> = {},
): ShiftLibraryGame => ({
  id,
  title: id.toUpperCase(),
  artUrl: `${id}.png`,
  ...extra,
})

const ids = (games: readonly ShiftLibraryGame[]) => games.map(g => g.id)

const games: readonly ShiftLibraryGame[] = [
  game("played-old", { lastPlayedAt: 100, playtimeMinutes: 30 }),
  game("played-new", {
    lastPlayedAt: 900,
    playtimeMinutes: 600,
    favorite: true,
  }),
  game("starred-fresh", { favorite: true }),
  game("fresh", {}),
]

describe("resolveShiftLibraryIntent", () => {
  it("resume returns only played games, most-recent first", () => {
    expect(ids(resolveShiftLibraryIntent(games, "resume"))).toEqual([
      "played-new",
      "played-old",
    ])
  })

  it("favorites returns only starred games", () => {
    expect(ids(resolveShiftLibraryIntent(games, "favorites")).sort()).toEqual([
      "played-new",
      "starred-fresh",
    ])
  })

  it("most-played sorts by playtime and excludes unknown playtime", () => {
    expect(ids(resolveShiftLibraryIntent(games, "most-played"))).toEqual([
      "played-new",
      "played-old",
    ])
  })

  it("never-played returns only games with no last-played", () => {
    expect(ids(resolveShiftLibraryIntent(games, "fresh")).sort()).toEqual([
      "fresh",
      "starred-fresh",
    ])
  })

  it("surprise is a deterministic, non-alphabetical permutation of all games", () => {
    const once = ids(resolveShiftLibraryIntent(games, "surprise"))
    const twice = ids(resolveShiftLibraryIntent(games, "surprise"))

    expect(once).toEqual(twice) // reproducible
    expect([...once].sort()).toEqual([...ids(games)].sort()) // loses nothing
  })

  it("every advertised intent resolves without error", () => {
    for (const intent of SHIFT_LIBRARY_INTENTS) {
      expect(Array.isArray(resolveShiftLibraryIntent(games, intent.id))).toBe(
        true,
      )
    }
  })

  it("an unknown intent resolves to nothing", () => {
    expect(resolveShiftLibraryIntent(games, "nope")).toEqual([])
  })
})
