import { describe, expect, it } from "bun:test"
import type { ShiftLibraryGame } from "./shift-library-game"
import {
  buildShiftLibraryGenreSections,
  buildShiftLibrarySections,
} from "./shift-library-sections"

const game = (
  id: string,
  extra: Partial<ShiftLibraryGame> = {},
): ShiftLibraryGame => ({
  id,
  title: id.toUpperCase(),
  artUrl: `${id}.png`,
  ...extra,
})

describe("buildShiftLibrarySections", () => {
  it("groups into Continue Playing, Favorites, and All Games", () => {
    const games = [
      game("a", { lastPlayedAt: 300, favorite: true }),
      game("b", { lastPlayedAt: 100 }),
      game("c", { favorite: true }),
      game("d"),
    ]

    const sections = buildShiftLibrarySections(games)

    expect(sections.map(section => section.id)).toEqual([
      "continue",
      "favorites",
      "all",
    ])
    expect(
      sections.find(s => s.id === "continue")?.games.map(g => g.id),
    ).toEqual(["a", "b"])
    expect(
      sections.find(s => s.id === "favorites")?.games.map(g => g.id),
    ).toEqual(["a", "c"])
    expect(sections.find(s => s.id === "all")?.games.map(g => g.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ])
  })

  it("orders Continue Playing most-recent first regardless of input order", () => {
    const games = [
      game("older", { lastPlayedAt: 100 }),
      game("newest", { lastPlayedAt: 900 }),
      game("middle", { lastPlayedAt: 500 }),
    ]

    const continueSection = buildShiftLibrarySections(games).find(
      s => s.id === "continue",
    )

    expect(continueSection?.games.map(g => g.id)).toEqual([
      "newest",
      "middle",
      "older",
    ])
  })

  it("omits empty sections so a shelf never renders without tiles", () => {
    const sections = buildShiftLibrarySections([game("only")])

    expect(sections.map(section => section.id)).toEqual(["all"])
  })

  it("returns nothing for an empty library", () => {
    expect(buildShiftLibrarySections([])).toEqual([])
  })
})

describe("buildShiftLibraryGenreSections", () => {
  it("makes one alphabetical shelf per genre with titles sorted within", () => {
    const games = [
      game("z-rpg", { title: "Zelda", genre: "RPG" }),
      game("a-rpg", { title: "Ara", genre: "RPG" }),
      game("plat", { title: "Celeste", genre: "Platformer" }),
    ]

    const sections = buildShiftLibraryGenreSections(games)

    expect(sections.map(s => s.title)).toEqual(["Platformer", "RPG"])
    expect(sections.find(s => s.title === "RPG")?.games.map(g => g.id)).toEqual(
      ["a-rpg", "z-rpg"],
    )
  })

  it("collects genre-less games into a trailing Other shelf", () => {
    const sections = buildShiftLibraryGenreSections([
      game("u", { genre: undefined }),
      game("p", { genre: "Platformer" }),
    ])

    expect(sections.map(s => s.title)).toEqual(["Platformer", "Other"])
  })
})
