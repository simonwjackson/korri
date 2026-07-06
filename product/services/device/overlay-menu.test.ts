import { describe, expect, it } from "bun:test"
import {
  createOverlayMenu,
  overlayMenuOptionsFor,
  safeDefaultIndex,
} from "./overlay-menu"

describe("overlay menu model", () => {
  it("throws when given no options", () => {
    expect(() => createOverlayMenu([])).toThrow()
  })

  it("moves selection with next/prev and clamps at the ends", () => {
    const menu = createOverlayMenu(
      [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      0,
    )
    expect(menu.state().selected).toBe(0)
    expect(menu.handle("up")).toBeNull()
    expect(menu.state().selected).toBe(0) // clamped low
    menu.handle("right")
    expect(menu.state().selected).toBe(1)
    menu.handle("down")
    expect(menu.state().selected).toBe(2)
    menu.handle("down")
    expect(menu.state().selected).toBe(2) // clamped high
    menu.handle("left")
    expect(menu.state().selected).toBe(1)
  })

  it("resolves accept to the selected id and back to cancelled", () => {
    const menu = createOverlayMenu(
      [
        { id: "quit-game", label: "Quit game", danger: true },
        { id: "keep-playing", label: "Keep playing" },
      ],
      1,
    )
    expect(menu.handle("accept")).toEqual({
      kind: "chosen",
      id: "keep-playing",
    })
    menu.handle("left")
    expect(menu.handle("accept")).toEqual({ kind: "chosen", id: "quit-game" })
    expect(menu.handle("back")).toEqual({ kind: "cancelled" })
  })

  it("honors the initial selection, clamped", () => {
    const options = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ]
    expect(createOverlayMenu(options, 99).state().selected).toBe(1)
    expect(createOverlayMenu(options, -5).state().selected).toBe(0)
  })

  it("composes local vs stream options with keep-playing last", () => {
    const local = overlayMenuOptionsFor("local")
    expect(local.map(o => o.id)).toEqual(["quit-game", "keep-playing"])
    const stream = overlayMenuOptionsFor("stream")
    expect(stream.map(o => o.id)).toEqual([
      "close-stream",
      "close-game",
      "keep-playing",
    ])
    // the destructive option is flagged
    expect(stream.find(o => o.id === "close-game")?.danger).toBe(true)
  })

  it("defaults selection to keep-playing", () => {
    expect(safeDefaultIndex(overlayMenuOptionsFor("stream"))).toBe(2)
    expect(safeDefaultIndex(overlayMenuOptionsFor("local"))).toBe(1)
  })
})
