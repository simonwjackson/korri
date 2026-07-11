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

  it("offers a seamless freeze option before keep-playing on both kinds", () => {
    const local = overlayMenuOptionsFor("local", {
      available: true,
      frozen: false,
    })
    expect(local.map(o => o.id)).toEqual([
      "quit-game",
      "freeze-game",
      "keep-playing",
    ])
    const stream = overlayMenuOptionsFor("stream", {
      available: true,
      frozen: false,
    })
    expect(stream.map(o => o.id)).toEqual([
      "close-stream",
      "close-game",
      "freeze-game",
      "keep-playing",
    ])
    // The label is identical regardless of where the game lives.
    expect(local.find(o => o.id === "freeze-game")?.label).toBe(
      stream.find(o => o.id === "freeze-game")?.label,
    )
  })

  it("toggles to resume-game when the session is frozen", () => {
    const local = overlayMenuOptionsFor("local", {
      available: true,
      frozen: true,
    })
    expect(local.map(o => o.id)).toEqual([
      "quit-game",
      "resume-game",
      "keep-playing",
    ])
    const stream = overlayMenuOptionsFor("stream", {
      available: true,
      frozen: true,
    })
    expect(stream.map(o => o.id)).toContain("resume-game")
    expect(stream.map(o => o.id)).not.toContain("freeze-game")
  })

  it("omits the freeze option when freeze is unavailable", () => {
    expect(
      overlayMenuOptionsFor("local", { available: false, frozen: false }).map(
        o => o.id,
      ),
    ).toEqual(["quit-game", "keep-playing"])
    expect(overlayMenuOptionsFor("local").map(o => o.id)).toEqual([
      "quit-game",
      "keep-playing",
    ])
  })

  it("keeps keep-playing as the safe default with the freeze option present", () => {
    const options = overlayMenuOptionsFor("stream", {
      available: true,
      frozen: false,
    })
    expect(options[safeDefaultIndex(options)]?.id).toBe("keep-playing")
  })
})
