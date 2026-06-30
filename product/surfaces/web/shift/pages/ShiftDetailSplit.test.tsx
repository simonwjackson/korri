import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftDetailSplit } from "./ShiftDetailSplit"
import type { ShiftGameDetailView } from "./shift-game-detail-view"

afterEach(() => cleanup())

const played: ShiftGameDetailView = {
  id: "hk",
  title: "Hollow Knight",
  artUrl: "hk.png",
  genre: "Metroidvania",
  developer: "Team Cherry",
  lastPlayedLabel: "3h ago",
  playtimeLabel: "4.5h",
  favorite: true,
}

const fresh: ShiftGameDetailView = {
  id: "new",
  title: "Brand New",
  artUrl: "new.png",
}

describe("ShiftDetailSplit", () => {
  it("shows the game title and tags, with no riffle arrows or counter", () => {
    render(<ShiftDetailSplit game={played} />)

    expect(screen.getByRole("heading", { name: "Hollow Knight" })).toBeDefined()
    expect(screen.getByText("Metroidvania · Team Cherry")).toBeDefined()
    // Dropped browse affordances:
    expect(screen.queryByRole("button", { name: "Next game" })).toBeNull()
    expect(screen.queryByText(/^\d+ \/ \d+$/)).toBeNull()
  })

  it("labels the primary action Continue once played", () => {
    const onPlay = mock(() => undefined)
    render(<ShiftDetailSplit game={played} onPlay={onPlay} />)

    fireEvent.click(screen.getByRole("button", { name: "▶ Continue" }))
    expect(onPlay).toHaveBeenCalledWith("hk")
  })

  it("labels the primary action Play when never played", () => {
    render(<ShiftDetailSplit game={fresh} />)
    expect(screen.getByRole("button", { name: "▶ Play" })).toBeDefined()
  })

  it("favorites the game by id", () => {
    const onFavorite = mock(() => undefined)
    render(<ShiftDetailSplit game={played} onFavorite={onFavorite} />)

    fireEvent.click(screen.getByRole("button", { name: /Favorit/ }))
    expect(onFavorite).toHaveBeenCalledWith("hk")
  })
})
