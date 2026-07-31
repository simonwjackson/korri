import { describe, expect, it } from "bun:test"
import {
  createPointerAdapter,
  ENTRY_INDEX_ATTRIBUTE,
  ENTRY_KEY_ATTRIBUTE,
} from "./pointer-adapter"
import type { InputAction } from "./types"

const mount = (html: string) => {
  document.body.innerHTML = html
  return document.body
}

const collect = () => {
  const seen: InputAction[] = []
  const stop = createPointerAdapter().start(action => seen.push(action))
  return { seen, stop }
}

const click = (element: Element) => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
}

describe("createPointerAdapter", () => {
  it("turns a tap on an entry into an activate carrying that entry's index", () => {
    mount(`<ul><li ${ENTRY_INDEX_ATTRIBUTE}="2" ${ENTRY_KEY_ATTRIBUTE}="entry-2" id="row">Wario Land 4</li></ul>`)
    const { seen, stop } = collect()

    click(document.getElementById("row")!)
    stop()

    expect(seen).toEqual([{ type: "activate", index: 2, key: "entry-2", source: "pointer" }])
  })

  it("counts a tap on a child as a tap on its row", () => {
    // Sub-captions cover much of a row; without this only padding would work.
    mount(
      `<li ${ENTRY_INDEX_ATTRIBUTE}="1" ${ENTRY_KEY_ATTRIBUTE}="entry-1"><span id="caption">GBA · This device</span></li>`,
    )
    const { seen, stop } = collect()

    click(document.getElementById("caption")!)
    stop()

    expect(seen).toEqual([{ type: "activate", index: 1, key: "entry-1", source: "pointer" }])
  })

  it("ignores taps outside any entry", () => {
    mount(`<div id="backdrop">Korri</div><li ${ENTRY_INDEX_ATTRIBUTE}="0" ${ENTRY_KEY_ATTRIBUTE}="entry-0">x</li>`)
    const { seen, stop } = collect()

    click(document.getElementById("backdrop")!)
    stop()

    expect(seen).toEqual([])
  })

  it("never emits a bare confirm, so a tap cannot activate the wrong row", () => {
    mount(`<li ${ENTRY_INDEX_ATTRIBUTE}="3" ${ENTRY_KEY_ATTRIBUTE}="entry-3" id="row">x</li>`)
    const { seen, stop } = collect()

    click(document.getElementById("row")!)
    stop()

    expect(seen.every(action => action.type !== "confirm")).toBe(true)
  })

  for (const rawIndex of [
    "not-a-number",
    "1junk",
    " 1",
    "+1",
    "1.5",
    "01",
    "9007199254740992",
  ]) {
    it(`ignores non-canonical index ${JSON.stringify(rawIndex)} rather than guessing`, () => {
      mount(`<li ${ENTRY_INDEX_ATTRIBUTE}="${rawIndex}" ${ENTRY_KEY_ATTRIBUTE}="entry-${rawIndex}" id="row">x</li>`)
      const { seen, stop } = collect()

      click(document.getElementById("row")!)
      stop()

      expect(seen).toEqual([])
    })
  }

  for (const keyAttribute of ["", ` ${ENTRY_KEY_ATTRIBUTE}=""`]) {
    it(`ignores entries ${keyAttribute === "" ? "without" : "with an empty"} stable key`, () => {
      mount(`<li ${ENTRY_INDEX_ATTRIBUTE}="1"${keyAttribute} id="row">x</li>`)
      const { seen, stop } = collect()

      click(document.getElementById("row")!)
      stop()

      expect(seen).toEqual([])
    })
  }

  it("stops listening once disposed", () => {
    mount(`<li ${ENTRY_INDEX_ATTRIBUTE}="0" ${ENTRY_KEY_ATTRIBUTE}="entry-0" id="row">x</li>`)
    const { seen, stop } = collect()

    stop()
    click(document.getElementById("row")!)

    expect(seen).toEqual([])
  })
})
