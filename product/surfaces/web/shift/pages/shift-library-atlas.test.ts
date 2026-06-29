import { describe, expect, it } from "bun:test"
import { buildShiftLibraryAtlas } from "./shift-library-atlas"
import type { ShiftLibraryGame } from "./shift-library-game"

const game = (
  id: string,
  extra: Partial<ShiftLibraryGame> = {},
): ShiftLibraryGame => ({
  id,
  title: id.toUpperCase(),
  artUrl: `${id}.png`,
  ...extra,
})

describe("buildShiftLibraryAtlas", () => {
  it("makes one territory per genre, alphabetical, titles sorted within", () => {
    const atlas = buildShiftLibraryAtlas([
      game("z", { title: "Zed", genre: "RPG" }),
      game("a", { title: "Ara", genre: "RPG" }),
      game("c", { title: "Celeste", genre: "Platformer" }),
    ])

    expect(atlas.clusters.map(c => c.label)).toEqual(["Platformer", "RPG"])
    expect(
      atlas.clusters.find(c => c.label === "RPG")?.games.map(g => g.id),
    ).toEqual(["a", "z"])
  })

  it("places clusters on a square-ish grid with col/row cells", () => {
    const atlas = buildShiftLibraryAtlas([
      game("1", { genre: "A" }),
      game("2", { genre: "B" }),
      game("3", { genre: "C" }),
      game("4", { genre: "D" }),
    ])

    expect(atlas.columns).toBe(2)
    expect(atlas.clusters.map(c => `${c.col},${c.row}`)).toEqual([
      "0,0",
      "1,0",
      "0,1",
      "1,1",
    ])
  })

  it("collects genre-less games into a trailing Other territory", () => {
    const atlas = buildShiftLibraryAtlas([
      game("u", {}),
      game("p", { genre: "Platformer" }),
    ])

    expect(atlas.clusters.map(c => c.label)).toEqual(["Platformer", "Other"])
  })
})
