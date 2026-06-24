import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { PicoGame } from "./fixtures"
import { VariantCartridgeShelf } from "./VariantCartridgeShelf"
import { VariantGameDetail } from "./VariantGameDetail"

afterEach(() => cleanup())

function game(id: string, title: string): PicoGame {
  return {
    id,
    title,
    genre: "GAME",
    developer: "UNKNOWN",
    favorite: false,
    lastPlayedAt: null,
    lastPlayedLabel: null,
    playtimeLabel: null,
  }
}

const games: readonly PicoGame[] = [
  game("a", "Game A"),
  game("b", "Game B"),
  game("c", "Game C"),
  game("d", "Game D"),
]

describe("pico click-through handlers", () => {
  it("VariantCartridgeShelf selects the focused hero", () => {
    const onSelect = mock(() => undefined)
    render(<VariantCartridgeShelf games={games} onSelect={onSelect} />)

    // Hero starts at index 2 → "Game C".
    fireEvent.click(screen.getByRole("button", { name: /open Game C/i }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ id: "c" })
  })

  it("VariantCartridgeShelf renders no select hit without a handler", () => {
    render(<VariantCartridgeShelf games={games} />)
    expect(screen.queryByRole("button", { name: /^open / })).toBeNull()
  })

  it("VariantGameDetail plays the focused game", () => {
    const onPlay = mock(() => undefined)
    render(<VariantGameDetail games={games} onPlay={onPlay} />)

    fireEvent.click(screen.getByRole("button", { name: /play|continue/i }))

    expect(onPlay).toHaveBeenCalledTimes(1)
  })
})
