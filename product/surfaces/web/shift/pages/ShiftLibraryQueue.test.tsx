import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftLibraryQueue } from "./ShiftLibraryQueue"
import type { ShiftLibraryGame } from "./shift-library-game"

afterEach(() => cleanup())

const games: readonly ShiftLibraryGame[] = [
  { id: "recent", title: "Recent", artUrl: "1.png", lastPlayedAt: 900 },
  { id: "starred", title: "Starred", artUrl: "2.png", favorite: true },
  { id: "cold", title: "Cold", artUrl: "3.png" },
]

describe("ShiftLibraryQueue", () => {
  it("features the most-recent game as Now Playing with a Resume action", () => {
    render(<ShiftLibraryQueue games={games} />)

    expect(screen.getByRole("heading", { name: "Recent" })).toBeDefined()
    expect(screen.getByRole("button", { name: /Resume/ })).toBeDefined()
  })

  it("shows the Up Next and Backlog lanes", () => {
    render(<ShiftLibraryQueue games={games} />)

    expect(screen.getByRole("heading", { name: "Up Next" })).toBeDefined()
    expect(screen.getByRole("heading", { name: "Backlog" })).toBeDefined()
  })

  it("resumes the Now game by id", () => {
    const onSelect = mock(() => undefined)
    render(<ShiftLibraryQueue games={games} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("button", { name: /Resume/ }))

    expect(onSelect).toHaveBeenCalledWith("recent")
  })

  it("promotes a Backlog game into Up Next when activated", () => {
    render(<ShiftLibraryQueue games={games} />)

    // "Cold" starts in Backlog; the Up Next lane has no such heading member yet.
    const backlog = screen.getByRole("heading", { name: "Backlog" })
    expect(backlog).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Cold" }))

    // After promotion it should sit under Up Next (a starred game is already
    // there, so the lane persists and now also contains Cold).
    const upNext = screen.getByRole("heading", { name: "Up Next" })
    const lane = upNext.parentElement
    expect(lane?.textContent).toContain("Cold")
  })
})
