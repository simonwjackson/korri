import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftLibraryGrid } from "./ShiftLibraryGrid"
import type { ShiftLibraryGame } from "./shift-library-game"

afterEach(() => cleanup())

const games: readonly ShiftLibraryGame[] = [
  { id: "a", title: "Game A", artUrl: "a.png" },
  { id: "b", title: "Game B", artUrl: "b.png", favorite: true },
  { id: "c", title: "Game C", artUrl: "c.png" },
]

describe("ShiftLibraryGrid", () => {
  it("renders a tile for every game", () => {
    render(<ShiftLibraryGrid games={games} />)

    for (const game of games) {
      expect(screen.getByRole("button", { name: game.title })).toBeDefined()
    }
  })

  it("activates the clicked tile by id", () => {
    const onSelect = mock(() => undefined)
    render(<ShiftLibraryGrid games={games} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("button", { name: "Game B" }))

    expect(onSelect).toHaveBeenCalledWith("b")
  })

  it("shows a singular/plural count of the library", () => {
    const { rerender } = render(<ShiftLibraryGrid games={games} />)
    expect(screen.getByText("3 games")).toBeDefined()

    rerender(<ShiftLibraryGrid games={[games[0]]} />)
    expect(screen.getByText("1 game")).toBeDefined()
  })

  it("renders an empty message when there are no games", () => {
    render(<ShiftLibraryGrid games={[]} />)

    expect(screen.getByText("No games found.")).toBeDefined()
    expect(screen.queryByRole("button")).toBeNull()
  })
})
