import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftLibraryLens } from "./ShiftLibraryLens"
import type { ShiftLibraryGame } from "./shift-library-game"

afterEach(() => cleanup())

const games: readonly ShiftLibraryGame[] = [
  {
    id: "rpg",
    title: "RPG One",
    artUrl: "1.png",
    genre: "RPG",
    favorite: true,
  },
  { id: "plat", title: "Platformer", artUrl: "2.png", genre: "Platformer" },
  { id: "rpg2", title: "RPG Two", artUrl: "3.png", genre: "RPG" },
]

describe("ShiftLibraryLens", () => {
  it("shows every game under the All lens by default", () => {
    render(<ShiftLibraryLens games={games} />)
    expect(
      screen.getAllByRole("button", { name: /RPG One|Platformer|RPG Two/ }),
    ).toHaveLength(3)
  })

  it("narrows to favorites when the Favorites lens is selected", () => {
    render(<ShiftLibraryLens games={games} />)

    fireEvent.click(screen.getByRole("tab", { name: "Favorites" }))

    expect(screen.getByRole("button", { name: "RPG One" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Platformer" })).toBeNull()
  })

  it("cycles the sort in place via the standing placard", () => {
    render(<ShiftLibraryLens games={games} />)

    // No summon step: the sort is a standing placard showing the active sort.
    expect(
      screen.getByRole("button", { name: /^Sorted by Recent/ }),
    ).toBeDefined()

    // Pressing it cycles to the next sort in place.
    fireEvent.click(screen.getByRole("button", { name: /^Sorted by Recent/ }))
    expect(screen.getByRole("button", { name: /^Sorted by A–Z/ })).toBeDefined()
  })

  it("groups into genre shelves under the By Genre lens", () => {
    render(<ShiftLibraryLens games={games} />)

    fireEvent.click(screen.getByRole("tab", { name: "By Genre" }))

    expect(screen.getByRole("heading", { name: "RPG" })).toBeDefined()
    expect(screen.getByRole("heading", { name: "Platformer" })).toBeDefined()
  })

  it("activates the clicked tile by id", () => {
    const onSelect = mock(() => undefined)
    render(<ShiftLibraryLens games={games} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("button", { name: "Platformer" }))

    expect(onSelect).toHaveBeenCalledWith("plat")
  })
})
