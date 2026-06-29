import { describe, expect, it } from "bun:test"
import type { ShiftLibraryGame } from "./shift-library-game"
import {
  applyShiftLibraryQuery,
  deriveShiftLibraryGenres,
  nextShiftLibrarySort,
  SHIFT_LIBRARY_DEFAULT_QUERY,
  type ShiftLibraryQuery,
  toggleGenre,
} from "./shift-library-query"

const game = (
  id: string,
  extra: Partial<ShiftLibraryGame> = {},
): ShiftLibraryGame => ({
  id,
  title: id.toUpperCase(),
  artUrl: `${id}.png`,
  ...extra,
})

const query = (over: Partial<ShiftLibraryQuery> = {}): ShiftLibraryQuery => ({
  ...SHIFT_LIBRARY_DEFAULT_QUERY,
  ...over,
})

const ids = (games: readonly ShiftLibraryGame[]) => games.map(g => g.id)

describe("applyShiftLibraryQuery — sort", () => {
  const games = [
    game("a", { title: "Bravo", lastPlayedAt: 100, playtimeMinutes: 50 }),
    game("b", { title: "Alpha", lastPlayedAt: 300, playtimeMinutes: 10 }),
    game("c", { title: "Charlie" }), // never played, unknown playtime
  ]

  it("orders recent by last-played desc, never-played last", () => {
    expect(
      ids(applyShiftLibraryQuery(games, query({ sort: "recent" }))),
    ).toEqual(["b", "a", "c"])
  })

  it("orders title alphabetically", () => {
    expect(
      ids(applyShiftLibraryQuery(games, query({ sort: "title" }))),
    ).toEqual(["b", "a", "c"])
  })

  it("orders playtime desc, unknown last, tie-breaking on title", () => {
    expect(
      ids(applyShiftLibraryQuery(games, query({ sort: "playtime" }))),
    ).toEqual(["a", "b", "c"])
  })

  it("does not mutate the input list", () => {
    const input = [...games]
    applyShiftLibraryQuery(input, query({ sort: "title" }))
    expect(ids(input)).toEqual(["a", "b", "c"])
  })
})

describe("applyShiftLibraryQuery — filter", () => {
  const games = [
    game("fav-rpg", { genre: "RPG", favorite: true }),
    game("rpg", { genre: "RPG" }),
    game("plat", { genre: "Platformer", favorite: true }),
  ]

  it("filters to favorites only", () => {
    expect(
      ids(
        applyShiftLibraryQuery(
          games,
          query({ favoriteOnly: true, sort: "title" }),
        ),
      ),
    ).toEqual(["fav-rpg", "plat"])
  })

  it("filters by selected genres", () => {
    expect(
      ids(
        applyShiftLibraryQuery(
          games,
          query({ genres: ["RPG"], sort: "title" }),
        ),
      ),
    ).toEqual(["fav-rpg", "rpg"])
  })

  it("treats an empty genre selection as all genres", () => {
    expect(ids(applyShiftLibraryQuery(games, query())).length).toBe(3)
  })

  it("combines favorite and genre filters", () => {
    expect(
      ids(
        applyShiftLibraryQuery(
          games,
          query({ favoriteOnly: true, genres: ["RPG"] }),
        ),
      ),
    ).toEqual(["fav-rpg"])
  })
})

describe("deriveShiftLibraryGenres", () => {
  it("counts genres, most-common first then alphabetical", () => {
    const facets = deriveShiftLibraryGenres([
      game("1", { genre: "RPG" }),
      game("2", { genre: "RPG" }),
      game("3", { genre: "Platformer" }),
      game("4", { genre: "Action" }),
      game("5", {}),
    ])

    expect(facets).toEqual([
      { value: "RPG", count: 2 },
      { value: "Action", count: 1 },
      { value: "Platformer", count: 1 },
    ])
  })
})

describe("query control helpers", () => {
  it("toggles a genre on and off immutably", () => {
    expect(toggleGenre([], "RPG")).toEqual(["RPG"])
    expect(toggleGenre(["RPG", "Action"], "RPG")).toEqual(["Action"])
  })

  it("cycles sort recent → title → playtime → recent", () => {
    expect(nextShiftLibrarySort("recent")).toBe("title")
    expect(nextShiftLibrarySort("title")).toBe("playtime")
    expect(nextShiftLibrarySort("playtime")).toBe("recent")
  })
})
