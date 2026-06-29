import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftLibraryDeck } from "./ShiftLibraryDeck"
import type { ShiftLibraryGame } from "./shift-library-game"

afterEach(() => cleanup())

const games: readonly ShiftLibraryGame[] = [
  { id: "a", title: "Game A", artUrl: "a.png" },
  { id: "b", title: "Game B", artUrl: "b.png" },
  { id: "c", title: "Game C", artUrl: "c.png" },
]

describe("ShiftLibraryDeck", () => {
  it("shows one game with a position counter", () => {
    render(<ShiftLibraryDeck games={games} />)

    expect(screen.getByRole("heading", { name: "Game A" })).toBeDefined()
    expect(screen.getByText("1 / 3")).toBeDefined()
  })

  it("plays the top card", () => {
    const onSelect = mock(() => undefined)
    render(<ShiftLibraryDeck games={games} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }))

    expect(onSelect).toHaveBeenCalledWith("a")
  })

  it("riffles to the next and previous card with wrap", () => {
    render(<ShiftLibraryDeck games={games} />)

    fireEvent.click(screen.getByRole("button", { name: "Next game" }))
    expect(screen.getByRole("heading", { name: "Game B" })).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Previous game" }))
    fireEvent.click(screen.getByRole("button", { name: "Previous game" }))
    expect(screen.getByRole("heading", { name: "Game C" })).toBeDefined()
  })

  it("toggles the favorite state of the current card", () => {
    render(<ShiftLibraryDeck games={games} />)
    const fav = screen.getByRole("button", { name: /Favorite/ })

    expect(fav.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(fav)
    expect(fav.getAttribute("aria-pressed")).toBe("true")
  })
})
