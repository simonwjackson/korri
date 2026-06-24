import { describe, expect, it } from "bun:test"
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import { picoGamesFromCatalog } from "./pico-catalog-view"

function entry(id: string, title: string, tileUrl?: string): CatalogEntry {
  return {
    id,
    itemId: id,
    title,
    launchable: true,
    system: "steam",
    releases: [{ id: "default", system: "steam", launchable: true }],
    ...(tileUrl
      ? {
          media: [
            {
              role: "tile",
              type: "image",
              width: 600,
              height: 900,
              url: tileUrl,
            },
          ],
        }
      : {}),
  } as unknown as CatalogEntry
}

describe("picoGamesFromCatalog", () => {
  it("maps catalog entries to the pico view model with title and cover art", () => {
    const games = picoGamesFromCatalog([
      entry("hollow-knight", "Hollow Knight", "https://cdn/hk.png"),
      entry("celeste", "Celeste"),
    ])

    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      id: "hollow-knight",
      title: "Hollow Knight",
      art: "https://cdn/hk.png",
    })
    expect(games[1]).toMatchObject({ id: "celeste", title: "Celeste" })
    expect(games[1]?.art).toBeUndefined()
  })

  it("preserves catalog order so the home rail is deterministic", () => {
    const games = picoGamesFromCatalog([
      entry("a", "A"),
      entry("b", "B"),
      entry("c", "C"),
    ])

    expect(games.map(game => game.id)).toEqual(["a", "b", "c"])
  })
})
