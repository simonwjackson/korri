import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { createPointerAdapter } from "./pointer-adapter"
import type { InputAction } from "./types"

/**
 * Helpers that build the synthetic events the pointer adapter listens for.
 * Real browsers fire PointerEvents with an OS-supplied `pointerType`; for
 * tests we synthesize them via plain Event objects with the relevant fields,
 * which is the same shape the adapter consumes via duck typing.
 */
function dispatchPointerMove(
  target: EventTarget,
  init: {
    target: HTMLElement
    pointerType?: string
    clientX?: number
    clientY?: number
  },
): void {
  const event = new Event("pointermove", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "target", { value: init.target })
  Object.defineProperty(event, "pointerType", {
    value: init.pointerType ?? "mouse",
  })
  Object.defineProperty(event, "clientX", { value: init.clientX ?? 0 })
  Object.defineProperty(event, "clientY", { value: init.clientY ?? 0 })
  target.dispatchEvent(event)
}

function dispatchContextMenu(
  target: EventTarget,
  init: { target: HTMLElement },
): Event {
  const event = new Event("contextmenu", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "target", { value: init.target })
  target.dispatchEvent(event)
  return event
}

describe("createPointerAdapter", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("emits pointer-activity on pointermove with source 'pointer'", () => {
    const target = new EventTarget()
    const button = document.createElement("button")
    document.body.append(button)

    const emitted: InputAction[] = []
    const stop = createPointerAdapter({ target }).start(action =>
      emitted.push(action),
    )

    dispatchPointerMove(target, { target: button, clientX: 10, clientY: 10 })

    expect(emitted).toContainEqual({
      type: "pointer-activity",
      source: "pointer",
    })

    stop()
  })

  it("focuses the hovered button on pointermove", () => {
    const target = new EventTarget()
    const button = document.createElement("button")
    document.body.append(button)

    const stop = createPointerAdapter({ target }).start(() => {})

    dispatchPointerMove(target, { target: button, clientX: 10, clientY: 10 })

    expect(document.activeElement).toBe(button)

    stop()
  })

  it("focuses the deepest focusable when targets are nested", () => {
    const target = new EventTarget()
    const outer = document.createElement("button")
    const inner = document.createElement("button")
    outer.append(inner)
    document.body.append(outer)

    const stop = createPointerAdapter({ target }).start(() => {})

    // Cursor is on the inner button — deepest focusable wins.
    dispatchPointerMove(target, { target: inner, clientX: 10, clientY: 10 })

    expect(document.activeElement).toBe(inner)

    stop()
  })

  it("walks up to the closest focusable when target is a non-focusable child", () => {
    const target = new EventTarget()
    const button = document.createElement("button")
    const span = document.createElement("span")
    button.append(span)
    document.body.append(button)

    const stop = createPointerAdapter({ target }).start(() => {})

    dispatchPointerMove(target, { target: span, clientX: 10, clientY: 10 })

    expect(document.activeElement).toBe(button)

    stop()
  })

  it("ignores pointermove events with pointerType 'touch'", () => {
    const target = new EventTarget()
    const button = document.createElement("button")
    document.body.append(button)

    const emitted: InputAction[] = []
    const stop = createPointerAdapter({ target }).start(action =>
      emitted.push(action),
    )

    dispatchPointerMove(target, {
      target: button,
      pointerType: "touch",
      clientX: 10,
      clientY: 10,
    })

    expect(emitted).toEqual([])
    expect(document.activeElement).not.toBe(button)

    stop()
  })

  it("ignores pointermove events with pointerType 'pen'", () => {
    const target = new EventTarget()
    const button = document.createElement("button")
    document.body.append(button)

    const emitted: InputAction[] = []
    const stop = createPointerAdapter({ target }).start(action =>
      emitted.push(action),
    )

    dispatchPointerMove(target, {
      target: button,
      pointerType: "pen",
      clientX: 10,
      clientY: 10,
    })

    expect(emitted).toEqual([])
    expect(document.activeElement).not.toBe(button)

    stop()
  })

  it("does not re-emit or re-focus on sub-threshold movement", () => {
    const target = new EventTarget()
    const button = document.createElement("button")
    document.body.append(button)

    const emitted: InputAction[] = []
    const stop = createPointerAdapter({
      target,
      movementThresholdPx: 5,
    }).start(action => emitted.push(action))

    // First move establishes baseline and emits.
    dispatchPointerMove(target, { target: button, clientX: 10, clientY: 10 })
    // Sub-threshold delta — same focusable, no new emit.
    dispatchPointerMove(target, { target: button, clientX: 12, clientY: 11 })

    expect(emitted).toHaveLength(1)

    stop()
  })

  it("does not blur when pointermove is over an element with no focusable ancestor", () => {
    const target = new EventTarget()
    const button = document.createElement("button")
    const gap = document.createElement("div")
    document.body.append(button, gap)
    button.focus()

    const emitted: InputAction[] = []
    const stop = createPointerAdapter({ target }).start(action =>
      emitted.push(action),
    )

    dispatchPointerMove(target, { target: gap, clientX: 100, clientY: 100 })

    expect(emitted).toContainEqual({
      type: "pointer-activity",
      source: "pointer",
    })
    expect(document.activeElement).toBe(button)

    stop()
  })

  it("emits pointer-activity but does not steal focus from an editable element", () => {
    const target = new EventTarget()
    const input = document.createElement("input")
    const button = document.createElement("button")
    document.body.append(input, button)
    input.focus()

    const emitted: InputAction[] = []
    const stop = createPointerAdapter({ target }).start(action =>
      emitted.push(action),
    )

    dispatchPointerMove(target, { target: button, clientX: 10, clientY: 10 })

    expect(emitted).toContainEqual({
      type: "pointer-activity",
      source: "pointer",
    })
    expect(document.activeElement).toBe(input)

    stop()
  })

  it("does not call focus on a focusable that is already active", () => {
    const target = new EventTarget()
    const button = document.createElement("button")
    document.body.append(button)
    button.focus()

    let focusCalls = 0
    const originalFocus = button.focus.bind(button)
    button.focus = () => {
      focusCalls += 1
      originalFocus()
    }

    const stop = createPointerAdapter({ target }).start(() => {})

    dispatchPointerMove(target, { target: button, clientX: 10, clientY: 10 })

    expect(focusCalls).toBe(0)

    stop()
  })

  it("emits options on right-click of a focusable and preventDefaults the menu", () => {
    const target = new EventTarget()
    const button = document.createElement("button")
    document.body.append(button)

    const emitted: InputAction[] = []
    const stop = createPointerAdapter({ target }).start(action =>
      emitted.push(action),
    )

    const event = dispatchContextMenu(target, { target: button })

    expect(emitted).toEqual([{ type: "options", source: "pointer" }])
    expect(event.defaultPrevented).toBe(true)

    stop()
  })

  it("does not emit options or preventDefault for right-click on non-focusable space", () => {
    const target = new EventTarget()
    const div = document.createElement("div")
    document.body.append(div)

    const emitted: InputAction[] = []
    const stop = createPointerAdapter({ target }).start(action =>
      emitted.push(action),
    )

    const event = dispatchContextMenu(target, { target: div })

    expect(emitted).toEqual([])
    expect(event.defaultPrevented).toBe(false)

    stop()
  })

  it("disposing removes listeners — subsequent events do not emit", () => {
    const target = new EventTarget()
    const button = document.createElement("button")
    document.body.append(button)

    const emitted: InputAction[] = []
    const stop = createPointerAdapter({ target }).start(action =>
      emitted.push(action),
    )

    stop()

    dispatchPointerMove(target, { target: button, clientX: 10, clientY: 10 })
    dispatchContextMenu(target, { target: button })

    expect(emitted).toEqual([])
  })
})
