import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import {
  ShiftCinematicHome,
  type ShiftCinematicGame,
} from "./ShiftCinematicHome"

afterEach(() => cleanup())

const games: readonly ShiftCinematicGame[] = [
  { id: "a", title: "Game A", tileArtUrl: "a.png", wideArtUrl: "aw.png" },
  { id: "b", title: "Game B", tileArtUrl: "b.png", wideArtUrl: "bw.png" },
]

describe("ShiftCinematicHome onLaunch", () => {
  it("launches the focused tile and only focuses an unfocused one", () => {
    const onLaunch = mock(() => undefined)
    render(<ShiftCinematicHome games={games} onLaunch={onLaunch} />)

    // index 0 is focused at mount → clicking it launches.
    fireEvent.click(screen.getByRole("button", { name: "Game A" }))
    expect(onLaunch).toHaveBeenCalledWith("a")

    onLaunch.mockClear()

    // An unfocused tile focuses (no launch) on first click, launches on second.
    fireEvent.click(screen.getByRole("button", { name: "Game B" }))
    expect(onLaunch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Game B" }))
    expect(onLaunch).toHaveBeenCalledWith("b")
  })

  it("does not require a launch handler (prototype/fixture usage)", () => {
    render(<ShiftCinematicHome games={games} />)
    fireEvent.click(screen.getByRole("button", { name: "Game A" }))
    // No throw, tile is focusable without a handler.
    expect(screen.getByRole("button", { name: "Game A" })).toBeTruthy()
  })
})
