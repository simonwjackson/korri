import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { ShiftPageStories } from "../ShiftScreens.page.part"
import {
  ShiftLibraryDeckStates,
  ShiftLibraryFilterBarStates,
  ShiftLibraryGridStates,
  ShiftLibraryLensStates,
  ShiftLibraryReelStates,
  ShiftLibraryShelvesStates,
} from "./ShiftLibrary.template.part"
import { ShiftLibraryDeck } from "./ShiftLibraryDeck"
import { ShiftLibraryFilterBar } from "./ShiftLibraryFilterBar"
import { ShiftLibraryGrid } from "./ShiftLibraryGrid"
import { ShiftLibraryLens } from "./ShiftLibraryLens"
import { ShiftLibraryReel } from "./ShiftLibraryReel"
import { ShiftLibraryShelves } from "./ShiftLibraryShelves"
import { ShiftLibraryTileStates } from "./ShiftLibraryTile.molecule.part"
import type { ShiftLibraryGame } from "./shift-library-game"
import { buildShiftLibrarySections } from "./shift-library-sections"

afterEach(cleanup)

const FAMILIES = [
  ["Grid", ShiftLibraryGridStates],
  ["Shelves", ShiftLibraryShelvesStates],
  ["Lens", ShiftLibraryLensStates],
  ["Filter Bar", ShiftLibraryFilterBarStates],
  ["Deck", ShiftLibraryDeckStates],
  ["Reel", ShiftLibraryReelStates],
] as const

describe("Shift Library page parts", () => {
  it("declares a page state family with Ready and Empty for every variant", () => {
    for (const [, family] of FAMILIES) {
      expect(family.map(story => story.state)).toEqual(["Ready", "Empty"])
      for (const story of family) {
        expect(story.layer).toBe("template")
        expect(story.surface).toBe(true)
        expect(story.name.startsWith("Library")).toBe(true)
        expect(story.designPartId?.startsWith("shift.library-")).toBe(true)
      }
    }
  })

  it("renders the real dev library at Ready in every variant", () => {
    for (const [, family] of FAMILIES) {
      const ready = family.find(story => story.state === "Ready")
      const { container, unmount } = render(<div>{ready?.render()}</div>)
      expect(container.querySelector("[data-shift-library]")).toBeTruthy()
      expect(container.querySelector(".shift-lib-empty")).toBeNull()
      unmount()
    }
  })

  it("renders each variant's own real empty state at Empty", () => {
    for (const [, family] of FAMILIES) {
      const empty = family.find(story => story.state === "Empty")
      const { container, unmount } = render(<div>{empty?.render()}</div>)
      expect(container.querySelector(".shift-lib-empty")).toBeTruthy()
      unmount()
    }
  })

  it("no longer duplicates Library stories through the ShiftScreens bridge", () => {
    expect(
      ShiftPageStories.filter(story => story.name.startsWith("Library")),
    ).toHaveLength(0)
  })
})

describe("Shift Library tile part", () => {
  it("shows the favourite star only in the Favorite state", () => {
    const favorite = ShiftLibraryTileStates.find(
      story => story.state === "Favorite",
    )
    const plain = ShiftLibraryTileStates.find(story => story.state === "Plain")

    const favoriteRender = render(<div>{favorite?.render()}</div>)
    expect(favoriteRender.container.textContent).toContain("★")
    favoriteRender.unmount()

    const plainRender = render(<div>{plain?.render()}</div>)
    expect(plainRender.container.textContent).not.toContain("★")
  })
})

describe("single-item library", () => {
  const one: readonly ShiftLibraryGame[] = [
    { id: "solo", title: "Solo Game", artUrl: "" },
  ]

  it("renders in every layout without error", () => {
    const renders = [
      <ShiftLibraryGrid key="grid" games={one} />,
      <ShiftLibraryShelves
        key="shelves"
        sections={buildShiftLibrarySections(one)}
      />,
      <ShiftLibraryLens key="lens" games={one} />,
      <ShiftLibraryFilterBar key="filterbar" games={one} />,
      <ShiftLibraryDeck key="deck" games={one} />,
      <ShiftLibraryReel key="reel" games={one} />,
    ]
    for (const node of renders) {
      const { unmount } = render(node)
      expect(screen.getAllByText("Solo Game").length).toBeGreaterThan(0)
      unmount()
    }
  })
})
