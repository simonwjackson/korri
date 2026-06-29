import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftLibraryConcierge } from "./ShiftLibraryConcierge"
import type { ShiftLibraryGame } from "./shift-library-game"

afterEach(() => cleanup())

const games: readonly ShiftLibraryGame[] = [
  {
    id: "fav",
    title: "Favored",
    artUrl: "1.png",
    favorite: true,
    lastPlayedAt: 5,
  },
  { id: "fresh", title: "Fresh", artUrl: "2.png" },
]

describe("ShiftLibraryConcierge", () => {
  it("opens on intent prompts, not the wall of games", () => {
    render(<ShiftLibraryConcierge games={games} />)

    expect(screen.getByRole("button", { name: /My favorites/ })).toBeDefined()
    // No game tiles are shown until an intent is chosen.
    expect(screen.queryByRole("button", { name: "Favored" })).toBeNull()
  })

  it("answers a chosen intent with a small result set", () => {
    render(<ShiftLibraryConcierge games={games} />)

    fireEvent.click(screen.getByRole("button", { name: /My favorites/ }))

    expect(screen.getByRole("button", { name: "Favored" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Fresh" })).toBeNull()
  })

  it("returns to the prompts via 'Ask again'", () => {
    render(<ShiftLibraryConcierge games={games} />)

    fireEvent.click(screen.getByRole("button", { name: /My favorites/ }))
    fireEvent.click(screen.getByRole("button", { name: /Ask again/ }))

    // Back to prompts: the intent buttons are visible, the tiles are gone.
    expect(screen.getByRole("button", { name: /Never played/ })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Favored" })).toBeNull()
  })

  it("launches an answered game by id", () => {
    const onSelect = mock(() => undefined)
    render(<ShiftLibraryConcierge games={games} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("button", { name: /My favorites/ }))
    fireEvent.click(screen.getByRole("button", { name: "Favored" }))

    expect(onSelect).toHaveBeenCalledWith("fav")
  })
})
