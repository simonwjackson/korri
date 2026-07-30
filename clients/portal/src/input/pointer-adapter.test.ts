import { describe, expect, it } from "bun:test"
import { createPointerAdapter, ENTRY_INDEX_ATTRIBUTE } from "./pointer-adapter"
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
    mount(`<ul><li ${ENTRY_INDEX_ATTRIBUTE}="2" id="row">Wario Land 4</li></ul>`)
    const { seen, stop } = collect()

    click(document.getElementById("row")!)
    stop()

    expect(seen).toEqual([{ type: "activate", index: 2, source: "pointer" }])
  })

  it("counts a tap on a child as a tap on its row", () => {
    // Sub-captions cover much of a row; without this only padding would work.
    mount(
      `<li ${ENTRY_INDEX_ATTRIBUTE}="1"><span id="caption">GBA · This device</span></li>`,
    )
    const { seen, stop } = collect()

    click(document.getElementById("caption")!)
    stop()

    expect(seen).toEqual([{ type: "activate", index: 1, source: "pointer" }])
  })

  it("ignores taps outside any entry", () => {
    mount(`<div id="backdrop">Korri</div><li ${ENTRY_INDEX_ATTRIBUTE}="0">x</li>`)
    const { seen, stop } = collect()

    click(document.getElementById("backdrop")!)
    stop()

    expect(seen).toEqual([])
  })

  it("never emits a bare confirm, so a tap cannot activate the wrong row", () => {
    mount(`<li ${ENTRY_INDEX_ATTRIBUTE}="3" id="row">x</li>`)
    const { seen, stop } = collect()

    click(document.getElementById("row")!)
    stop()

    expect(seen.every(action => action.type !== "confirm")).toBe(true)
  })

  it("ignores a malformed index rather than guessing", () => {
    mount(`<li ${ENTRY_INDEX_ATTRIBUTE}="not-a-number" id="row">x</li>`)
    const { seen, stop } = collect()

    click(document.getElementById("row")!)
    stop()

    expect(seen).toEqual([])
  })

  it("stops listening once disposed", () => {
    mount(`<li ${ENTRY_INDEX_ATTRIBUTE}="0" id="row">x</li>`)
    const { seen, stop } = collect()

    stop()
    click(document.getElementById("row")!)

    expect(seen).toEqual([])
  })
})
