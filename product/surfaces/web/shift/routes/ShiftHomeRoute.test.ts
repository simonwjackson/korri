import { describe, expect, it } from "bun:test"
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import { toCinematicGame } from "./ShiftHomeRoute"

describe("toCinematicGame", () => {
  it("maps catalog metadata and user data into cinematic chip fields", () => {
    const game = toCinematicGame({
      id: "hollow-knight",
      itemId: "hollow-knight",
      title: "Hollow Knight",
      releases: [{ id: "default", system: "steam", launchable: true }],
      launchable: true,
      metadata: {
        name: "Hollow Knight",
        genre: ["Metroidvania"],
        developer: "Team Cherry",
      },
      userData: {
        lastPlayed: new Date(Date.now() - 3 * 60 * 60_000),
        playtime: 270,
        favorite: true,
      },
      media: [
        {
          role: "tile",
          type: "image",
          width: 600,
          height: 900,
          assetId: "tile",
          url: "tile.png",
        },
        {
          role: "banner",
          type: "image",
          width: 1920,
          height: 620,
          assetId: "hero",
          url: "hero.png",
        },
      ],
      source: {
        hostId: "local",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
      },
    } satisfies CatalogEntry)

    expect(game).toMatchObject({
      id: "hollow-knight",
      title: "Hollow Knight",
      genre: "Metroidvania",
      developer: "Team Cherry",
      tileArtUrl: "tile.png",
      wideArtUrl: "hero.png",
      playtimeLabel: "4.5h",
      favorite: true,
    })
    expect(game.lastPlayedLabel).toBe("3h ago")
  })

  it("formats string last-played values from serialized catalog data", () => {
    const game = toCinematicGame({
      id: "serialized-game",
      itemId: "serialized-game",
      title: "Serialized Game",
      releases: [{ id: "default", system: "unknown", launchable: false }],
      launchable: false,
      userData: {
        lastPlayed: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      },
      source: {
        hostId: "local",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
      },
    } satisfies CatalogEntry)

    expect(game.lastPlayedLabel).toBe("2h ago")
  })

  it("omits invalid string last-played values", () => {
    const game = toCinematicGame({
      id: "invalid-date-game",
      itemId: "invalid-date-game",
      title: "Invalid Date Game",
      releases: [{ id: "default", system: "unknown", launchable: false }],
      launchable: false,
      userData: { lastPlayed: "not-a-date" },
      source: {
        hostId: "local",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
      },
    } satisfies CatalogEntry)

    expect(game.lastPlayedLabel).toBeUndefined()
  })

  it("omits chip fields when catalog entries do not carry them", () => {
    const game = toCinematicGame({
      id: "bare-game",
      itemId: "bare-game",
      title: "Bare Game",
      releases: [{ id: "default", system: "unknown", launchable: false }],
      launchable: false,
      source: {
        hostId: "local",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
      },
    } satisfies CatalogEntry)

    expect(game.genre).toBeUndefined()
    expect(game.developer).toBeUndefined()
    expect(game.lastPlayedLabel).toBeUndefined()
    expect(game.playtimeLabel).toBeUndefined()
    expect(game.favorite).toBeUndefined()
  })
})
