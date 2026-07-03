import { afterEach, describe, expect, it, mock } from "bun:test"
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { shiftCatalogStateSamples } from "../shift-catalog-state-samples"
import {
  ShiftLibraryStateView,
  shiftLibraryGameFromCatalog,
} from "./ShiftLibraryRoute"

afterEach(() => cleanup())

const entry: CatalogEntry = {
  id: "g1",
  itemId: "g1",
  title: "Game One",
  releases: [{ id: "default", system: "steam", launchable: true }],
  launchable: true,
  metadata: { name: "Game One", genre: ["RPG"], developer: "Studio" },
  media: [
    {
      role: "tile",
      type: "image",
      assetId: "g1-tile",
      url: "g1.png",
      width: 600,
      height: 900,
    },
  ],
  userData: { favorite: true },
  playStats: {
    playCount: 3,
    totalPlaytimeSeconds: 5400,
    lastPlayed: new Date(1000),
  },
  source: {
    hostId: "self",
    controlUrl: "http://127.0.0.1:3001",
    isLocal: true,
  },
}

describe("shiftLibraryGameFromCatalog", () => {
  it("projects title, art, and sortable user data the Lens controls read", () => {
    expect(shiftLibraryGameFromCatalog(entry)).toMatchObject({
      id: "g1",
      title: "Game One",
      artUrl: "g1.png",
      genre: "RPG",
      developer: "Studio",
      favorite: true,
      lastPlayedAt: 1000,
      playtimeMinutes: 90,
    })
  })

  it("omits user data absent from the catalog entry", () => {
    const game = shiftLibraryGameFromCatalog({
      ...entry,
      userData: undefined,
      playStats: undefined,
    })
    expect(game.favorite).toBeUndefined()
    expect(game.lastPlayedAt).toBeUndefined()
    expect(game.playtimeMinutes).toBeUndefined()
  })
})

describe("ShiftLibraryStateView", () => {
  it("renders the Ready library and reports tile selection by id", () => {
    const onSelect = mock(() => undefined)
    render(
      <ShiftLibraryStateView
        result={shiftCatalogStateSamples.Ready()}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Celeste" }))

    expect(onSelect).toHaveBeenCalledWith("celeste")
  })
})
