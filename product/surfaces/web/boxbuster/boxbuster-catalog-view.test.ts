import { describe, expect, it } from "bun:test"
import { EntrySource } from "@platform/api/rpc/entry-source"
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import { boxbusterGamesFromCatalog } from "./boxbuster-catalog-view"

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
              assetId: `${id}-tile`,
              url: tileUrl,
            },
          ],
        }
      : {}),
    source: new EntrySource({
      hostId: "local",
      controlUrl: "http://localhost:3001",
      isLocal: true,
    }),
  } satisfies CatalogEntry
}

describe("boxbusterGamesFromCatalog", () => {
  it("maps catalog entries to Boxbuster games with ids and cover art", () => {
    const games = boxbusterGamesFromCatalog([
      entry("hollow-knight", "Hollow Knight", "https://cdn/hk.png"),
      entry("celeste", "Celeste"),
    ])

    expect(games[0]).toMatchObject({
      id: "hollow-knight",
      title: "Hollow Knight",
      platform: "STEAM",
      coverUrl: "https://cdn/hk.png",
    })
    expect(games[1]).toMatchObject({ id: "celeste", title: "Celeste" })
    expect(games[1]?.coverUrl).toBeUndefined()
  })

  it("preserves catalog order for deterministic shelf placement", () => {
    const games = boxbusterGamesFromCatalog([
      entry("a", "A"),
      entry("b", "B"),
      entry("c", "C"),
    ])

    expect(games.map(game => game.id)).toEqual(["a", "b", "c"])
  })
})
