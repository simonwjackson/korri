import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftLibraryReel } from "./ShiftLibraryReel"
import type { ShiftLibraryGame } from "./shift-library-game"

afterEach(() => cleanup())

const games: readonly ShiftLibraryGame[] = [
  { id: "a", title: "Game A", artUrl: "a.png", genre: "RPG" },
  { id: "b", title: "Game B", artUrl: "b.png" },
  { id: "c", title: "Game C", artUrl: "c.png" },
  { id: "d", title: "Game D", artUrl: "d.png" },
  { id: "e", title: "Game E", artUrl: "e.png" },
]

describe("ShiftLibraryReel", () => {
  it("centres the first game", () => {
    render(<ShiftLibraryReel games={games} />)
    expect(screen.getByRole("heading", { name: "Game A" })).toBeDefined()
  })

  it("plays the centred game", () => {
    const onSelect = mock(() => undefined)
    render(<ShiftLibraryReel games={games} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }))

    expect(onSelect).toHaveBeenCalledWith("a")
  })

  it("spins to a different game", () => {
    render(<ShiftLibraryReel games={games} />)

    // fling from centre 0 advances 3 steps → index 3 (Game D).
    fireEvent.click(screen.getByRole("button", { name: "🎰 Spin" }))

    expect(screen.getByRole("heading", { name: "Game D" })).toBeDefined()
  })
})
