import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftLibraryFilterBar } from "./ShiftLibraryFilterBar"
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

const tileNames = () =>
  screen
    .getAllByRole("button")
    .map(button => button.getAttribute("aria-label"))
    .filter((name): name is string =>
      ["RPG One", "RPG Two", "Platformer"].includes(name ?? ""),
    )

describe("ShiftLibraryFilterBar", () => {
  it("stands a sort control and a chip per genre with counts", () => {
    render(<ShiftLibraryFilterBar games={games} />)

    // Genre facet chip carries its count (RPG appears twice).
    const rpgChip = screen.getByRole("button", { name: /RPG\s*2/ })
    expect(rpgChip.getAttribute("aria-pressed")).toBe("false")
    expect(screen.getByRole("button", { name: /^Sort:/ })).toBeDefined()
  })

  it("filters to favorites when the toggle is pressed", () => {
    render(<ShiftLibraryFilterBar games={games} />)

    fireEvent.click(screen.getByRole("button", { name: "★ Favorites" }))

    expect(tileNames()).toEqual(["RPG One"])
  })

  it("filters by a genre chip", () => {
    render(<ShiftLibraryFilterBar games={games} />)

    // The genre chip's accessible name includes its count ("Platformer 1"),
    // which disambiguates it from the "Platformer" tile.
    fireEvent.click(screen.getByRole("button", { name: "Platformer 1" }))

    expect(tileNames()).toEqual(["Platformer"])
  })

  it("cycles the sort label on press", () => {
    render(<ShiftLibraryFilterBar games={games} />)
    const sort = screen.getByRole("button", { name: /^Sort:/ })

    expect(sort.textContent).toContain("Recent")
    fireEvent.click(sort)
    expect(sort.textContent).toContain("A–Z")
  })

  it("shows an empty message when filters match nothing", () => {
    render(<ShiftLibraryFilterBar games={games} />)

    fireEvent.click(screen.getByRole("button", { name: "★ Favorites" }))
    fireEvent.click(screen.getByRole("button", { name: "Platformer 1" }))

    expect(screen.getByText("Nothing matches these filters.")).toBeDefined()
  })

  it("activates the clicked tile by id", () => {
    const onSelect = mock(() => undefined)
    render(<ShiftLibraryFilterBar games={games} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("button", { name: "Platformer" }))

    expect(onSelect).toHaveBeenCalledWith("plat")
  })
})
