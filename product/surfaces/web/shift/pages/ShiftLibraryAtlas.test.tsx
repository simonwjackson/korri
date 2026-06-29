import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftLibraryAtlas } from "./ShiftLibraryAtlas"
import type { ShiftLibraryGame } from "./shift-library-game"

afterEach(() => cleanup())

const games: readonly ShiftLibraryGame[] = [
  { id: "rpg1", title: "RPG One", artUrl: "1.png", genre: "RPG" },
  { id: "plat", title: "Plat", artUrl: "2.png", genre: "Platformer" },
  { id: "rpg2", title: "RPG Two", artUrl: "3.png", genre: "RPG" },
]

describe("ShiftLibraryAtlas", () => {
  it("renders a territory per genre", () => {
    render(<ShiftLibraryAtlas games={games} />)

    expect(screen.getByRole("heading", { name: "RPG" })).toBeDefined()
    expect(screen.getByRole("heading", { name: "Platformer" })).toBeDefined()
  })

  it("selects a game tile by id", () => {
    const onSelect = mock(() => undefined)
    render(<ShiftLibraryAtlas games={games} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("button", { name: "Plat" }))

    expect(onSelect).toHaveBeenCalledWith("plat")
  })

  it("toggles zoom from the header control", () => {
    render(<ShiftLibraryAtlas games={games} />)
    const zoom = screen.getByRole("button", { name: /Zoom into/ })

    expect(zoom.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(zoom)
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDefined()
  })
})
