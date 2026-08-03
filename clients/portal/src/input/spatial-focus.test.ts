import { beforeEach, describe, expect, test } from "bun:test"
import { createInputBus } from "./bus"
import { createSpatialFocusController, focusInDirection } from "./spatial-focus"

/**
 * happy-dom does not lay elements out, so geometry is stubbed per element.
 * The behaviour under test is the choice, not the measurement.
 */
function place(
  element: HTMLElement,
  rect: { x: number; y: number; w?: number; h?: number },
) {
  const { x, y, w = 100, h = 100 } = rect
  element.getBoundingClientRect = () =>
    ({
      left: x,
      top: y,
      right: x + w,
      bottom: y + h,
      width: w,
      height: h,
      x,
      y,
    }) as DOMRect
}

function button(id: string, rect: { x: number; y: number }): HTMLElement {
  const element = document.createElement("button")
  element.id = id
  document.body.appendChild(element)
  place(element, rect)
  return element
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("focusInDirection", () => {
  test("moves along a rail to the next tile in the pressed direction", () => {
    const first = button("first", { x: 0, y: 0 })
    const second = button("second", { x: 200, y: 0 })
    button("third", { x: 400, y: 0 })
    first.focus()

    expect(focusInDirection("right")).toBe(true)
    expect(document.activeElement).toBe(second)
  })

  test("never moves opposite the pressed direction", () => {
    const first = button("first", { x: 0, y: 0 })
    first.focus()
    button("behind", { x: -200, y: 0 })

    expect(focusInDirection("right")).toBe(false)
    expect(document.activeElement).toBe(first)
  })

  test("prefers staying on the pressed axis over a nearer off-axis target", () => {
    const origin = button("origin", { x: 0, y: 0 })
    const sameRow = button("same-row", { x: 300, y: 0 })
    button("other-row", { x: 120, y: 400 })
    origin.focus()

    expect(focusInDirection("right")).toBe(true)
    expect(document.activeElement).toBe(sameRow)
  })

  test("seeds focus on the first control when nothing is focused", () => {
    const first = button("first", { x: 0, y: 0 })
    button("second", { x: 200, y: 0 })

    expect(focusInDirection("right")).toBe(true)
    expect(document.activeElement).toBe(first)
  })

  test("skips disabled and zero-sized controls", () => {
    const origin = button("origin", { x: 0, y: 0 })
    const disabled = button("disabled", { x: 200, y: 0 })
    ;(disabled as HTMLButtonElement).disabled = true
    const hidden = button("hidden", { x: 300, y: 0 })
    place(hidden, { x: 300, y: 0, w: 0, h: 0 })
    const reachable = button("reachable", { x: 400, y: 0 })
    origin.focus()

    expect(focusInDirection("right")).toBe(true)
    expect(document.activeElement).toBe(reachable)
  })

  test("cannot leave a container that blocks exit", () => {
    const panel = document.createElement("div")
    panel.setAttribute("data-block-exit", "true")
    document.body.appendChild(panel)
    const inside = document.createElement("button")
    panel.appendChild(inside)
    place(inside, { x: 500, y: 0 })
    const outside = button("outside", { x: 900, y: 0 })
    place(outside, { x: 900, y: 0 })
    inside.focus()

    expect(focusInDirection("right")).toBe(false)
    expect(document.activeElement).toBe(inside)
  })
})

describe("createSpatialFocusController", () => {
  test("confirm activates the focused control", () => {
    const bus = createInputBus()
    const dispose = createSpatialFocusController(bus)
    const target = button("target", { x: 0, y: 0 })
    let clicks = 0
    target.addEventListener("click", () => {
      clicks += 1
    })
    target.focus()

    bus.emit({ type: "confirm" })
    expect(clicks).toBe(1)

    dispose()
    bus.emit({ type: "confirm" })
    expect(clicks).toBe(1)
  })

  test("directions move focus through the bus", () => {
    const bus = createInputBus()
    const dispose = createSpatialFocusController(bus)
    const first = button("first", { x: 0, y: 0 })
    const second = button("second", { x: 200, y: 0 })
    first.focus()

    bus.emit({ type: "direction", direction: "right" })
    expect(document.activeElement).toBe(second)
    dispose()
  })
})
