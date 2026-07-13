import { afterEach, describe, expect, it } from "bun:test"
import { shiftFocusedGameId } from "./shift-focused-game"

afterEach(() => {
  document.body.innerHTML = ""
})

function mount(html: string): void {
  document.body.innerHTML = html
}

describe("shiftFocusedGameId", () => {
  it("reads the id when the focused element is the game holder", () => {
    mount(`<button data-shift-game-id="celeste">Celeste</button>`)
    const button = document.querySelector("button")
    expect(shiftFocusedGameId(button)).toBe("celeste")
  })

  it("walks up to the nearest game holder from a child", () => {
    mount(
      `<button data-shift-game-id="hades"><span id="art">art</span></button>`,
    )
    const child = document.getElementById("art")
    expect(shiftFocusedGameId(child)).toBe("hades")
  })

  it("returns null when nothing focusable holds a game id", () => {
    mount(`<button>Library</button>`)
    expect(shiftFocusedGameId(document.querySelector("button"))).toBeNull()
  })

  it("returns null for no active element or an empty id", () => {
    expect(shiftFocusedGameId(null)).toBeNull()
    mount(`<button data-shift-game-id="">x</button>`)
    expect(shiftFocusedGameId(document.querySelector("button"))).toBeNull()
  })
})
