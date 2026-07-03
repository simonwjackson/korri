import { describe, expect, it } from "bun:test"
import {
  clampPct,
  createOverlayRendererProcessClient,
  encodeHide,
  encodeMenu,
  encodeRing,
  type RendererProcess,
} from "./overlay-renderer-client"

describe("overlay renderer protocol", () => {
  it("clamps and rounds ring percent", () => {
    expect(clampPct(-5)).toBe(0)
    expect(clampPct(150)).toBe(100)
    expect(clampPct(49.6)).toBe(50)
    expect(encodeRing(50)).toBe("ring 50\n")
    expect(encodeRing(120)).toBe("ring 100\n")
  })

  it("encodes hide", () => {
    expect(encodeHide()).toBe("hide\n")
  })

  it("encodes a menu with header + one line per option", () => {
    expect(
      encodeMenu(
        [
          { id: "quit-game", label: "Quit game", danger: true },
          { id: "keep-playing", label: "Keep playing" },
        ],
        1,
      ),
    ).toBe("menu 1 2\n1 Quit game\n0 Keep playing\n")
  })

  it("strips newlines from labels to keep one command per line", () => {
    expect(
      encodeMenu([{ id: "x", label: "Bad\nlabel" }], 0),
    ).toBe("menu 0 1\n0 Bad label\n")
  })
})

describe("overlay renderer process client", () => {
  function fakeProc() {
    const writes: string[] = []
    let dead = false
    const proc: RendererProcess = {
      write: d => writes.push(d),
      alive: () => !dead,
    }
    return { proc, writes, kill: () => (dead = true) }
  }

  it("spawns lazily on first command and reuses the process", () => {
    const a = fakeProc()
    let spawns = 0
    const client = createOverlayRendererProcessClient({
      spawn: () => {
        spawns++
        return a.proc
      },
    })
    client.ring(10)
    client.ring(20)
    client.hide()
    expect(spawns).toBe(1)
    expect(a.writes).toEqual(["ring 10\n", "ring 20\n", "hide\n"])
  })

  it("respawns if the renderer died", () => {
    const a = fakeProc()
    const b = fakeProc()
    const procs = [a, b]
    let i = 0
    const client = createOverlayRendererProcessClient({
      spawn: () => procs[i++]!.proc,
    })
    client.ring(1)
    a.kill()
    client.ring(2)
    expect(a.writes).toEqual(["ring 1\n"])
    expect(b.writes).toEqual(["ring 2\n"])
  })
})
