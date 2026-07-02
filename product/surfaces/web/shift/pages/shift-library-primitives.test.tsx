import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { ShiftLibraryEmpty } from "./ShiftLibraryEmpty"
import { ShiftLibraryGridView } from "./ShiftLibraryGridView"
import {
  ShiftLibraryHeader,
  shiftLibraryCountLabel,
} from "./ShiftLibraryHeader"
import { ShiftLibraryShelf } from "./ShiftLibraryShelf"
import type { ShiftLibraryGame } from "./shift-library-game"

afterEach(cleanup)

const games: readonly ShiftLibraryGame[] = [
  { id: "a", title: "Alpha", artUrl: "" },
  { id: "b", title: "Beta", artUrl: "" },
]

describe("ShiftLibraryHeader", () => {
  it("pluralizes the count and renders a trailing control slot", () => {
    render(
      <ShiftLibraryHeader title="Library" count={2}>
        <button type="button">Sort</button>
      </ShiftLibraryHeader>,
    )
    expect(screen.getByText("Library")).toBeTruthy()
    expect(screen.getByText("2 games")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Sort" })).toBeTruthy()
  })

  it("omits the count when none is given and uses the singular label", () => {
    const { container } = render(<ShiftLibraryHeader title="Library" />)
    expect(container.querySelector(".shift-lib-count")).toBeNull()
    expect(shiftLibraryCountLabel(1)).toBe("1 game")
    expect(shiftLibraryCountLabel(3)).toBe("3 games")
  })
})

describe("ShiftLibraryEmpty", () => {
  it("defaults to the no-games message and honors an override", () => {
    const { rerender } = render(<ShiftLibraryEmpty />)
    expect(screen.getByText("No games found.")).toBeTruthy()
    rerender(<ShiftLibraryEmpty message="No favorites yet." />)
    expect(screen.getByText("No favorites yet.")).toBeTruthy()
  })
})

describe("ShiftLibraryGridView", () => {
  it("renders one focusable tile per game", () => {
    render(<ShiftLibraryGridView games={games} />)
    expect(screen.getByRole("button", { name: "Alpha" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Beta" })).toBeTruthy()
  })
})

describe("ShiftLibraryShelf", () => {
  it("renders its title over a track of tiles", () => {
    const { container } = render(
      <ShiftLibraryShelf title="Favorites" games={games} />,
    )
    expect(screen.getByText("Favorites")).toBeTruthy()
    expect(container.querySelectorAll(".shift-lib-tile")).toHaveLength(2)
  })
})
