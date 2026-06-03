import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import type { InputAction } from "./types"
import { createWheelAdapter } from "./wheel-adapter"

/**
 * Synthesize a WheelEvent. happy-dom's WheelEvent constructor accepts
 * deltaY/deltaX in init, but to keep tests robust we use Object.defineProperty
 * the same way we do for pointer events — the adapter consumes via duck
 * typing.
 */
function dispatchWheel(
  target: EventTarget,
  init: {
    target: HTMLElement
    deltaX?: number
    deltaY?: number
  },
): Event {
  const event = new Event("wheel", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "target", { value: init.target })
  Object.defineProperty(event, "deltaX", { value: init.deltaX ?? 0 })
  Object.defineProperty(event, "deltaY", { value: init.deltaY ?? 0 })
  target.dispatchEvent(event)
  return event
}

function makeContainer(axis: string): HTMLElement {
  const container = document.createElement("div")
  container.setAttribute("data-pointer-wheel", axis)
  const button = document.createElement("button")
  container.append(button)
  document.body.append(container)
  return container
}

describe("createWheelAdapter", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("emits 'down' on a vertical wheel inside a vertical container", () => {
    const target = new EventTarget()
    const container = makeContainer("vertical")
    const button = container.firstElementChild as HTMLElement

    const emitted: InputAction[] = []
    const stop = createWheelAdapter({ target, deltaThreshold: 80 }).start(
      action => emitted.push(action),
    )

    const event = dispatchWheel(target, { target: button, deltaY: 100 })

    expect(emitted).toEqual([
      { type: "direction", direction: "down", source: "wheel" },
    ])
    expect(event.defaultPrevented).toBe(true)

    stop()
  })

  it("emits 'up' on a negative-deltaY wheel inside a vertical container", () => {
    const target = new EventTarget()
    const container = makeContainer("vertical")
    const button = container.firstElementChild as HTMLElement

    const emitted: InputAction[] = []
    const stop = createWheelAdapter({ target, deltaThreshold: 80 }).start(
      action => emitted.push(action),
    )

    dispatchWheel(target, { target: button, deltaY: -100 })

    expect(emitted).toEqual([
      { type: "direction", direction: "up", source: "wheel" },
    ])

    stop()
  })

  it("emits exactly one direction at the threshold boundary", () => {
    const target = new EventTarget()
    const container = makeContainer("vertical")
    const button = container.firstElementChild as HTMLElement

    const emitted: InputAction[] = []
    const stop = createWheelAdapter({ target, deltaThreshold: 80 }).start(
      action => emitted.push(action),
    )

    dispatchWheel(target, { target: button, deltaY: 80 })

    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toEqual({
      type: "direction",
      direction: "down",
      source: "wheel",
    })

    stop()
  })

  it("treats 'horizontal' container by mapping vertical wheel to left/right", () => {
    const target = new EventTarget()
    const container = makeContainer("horizontal")
    const button = container.firstElementChild as HTMLElement

    const emitted: InputAction[] = []
    const stop = createWheelAdapter({ target, deltaThreshold: 80 }).start(
      action => emitted.push(action),
    )

    dispatchWheel(target, { target: button, deltaY: 100 })

    expect(emitted).toEqual([
      { type: "direction", direction: "right", source: "wheel" },
    ])

    stop()
  })

  it("emits 'left' for negative deltaY in a horizontal container", () => {
    const target = new EventTarget()
    const container = makeContainer("horizontal")
    const button = container.firstElementChild as HTMLElement

    const emitted: InputAction[] = []
    const stop = createWheelAdapter({ target, deltaThreshold: 80 }).start(
      action => emitted.push(action),
    )

    dispatchWheel(target, { target: button, deltaY: -100 })

    expect(emitted).toEqual([
      { type: "direction", direction: "left", source: "wheel" },
    ])

    stop()
  })

  it("maps deltaY axis on a 2d container", () => {
    const target = new EventTarget()
    const container = makeContainer("2d")
    const button = container.firstElementChild as HTMLElement

    const emitted: InputAction[] = []
    const stop = createWheelAdapter({ target, deltaThreshold: 80 }).start(
      action => emitted.push(action),
    )

    dispatchWheel(target, { target: button, deltaY: 100 })

    expect(emitted).toEqual([
      { type: "direction", direction: "down", source: "wheel" },
    ])

    stop()
  })

  it("maps deltaX axis on a 2d container", () => {
    const target = new EventTarget()
    const container = makeContainer("2d")
    const button = container.firstElementChild as HTMLElement

    const emitted: InputAction[] = []
    const stop = createWheelAdapter({ target, deltaThreshold: 80 }).start(
      action => emitted.push(action),
    )

    dispatchWheel(target, { target: button, deltaX: 100, deltaY: 0 })

    expect(emitted).toEqual([
      { type: "direction", direction: "right", source: "wheel" },
    ])

    stop()
  })

  it("accumulates sub-threshold deltas across events", () => {
    const target = new EventTarget()
    const container = makeContainer("vertical")
    const button = container.firstElementChild as HTMLElement

    const emitted: InputAction[] = []
    const stop = createWheelAdapter({ target, deltaThreshold: 80 }).start(
      action => emitted.push(action),
    )

    dispatchWheel(target, { target: button, deltaY: 50 })
    dispatchWheel(target, { target: button, deltaY: 50 })

    expect(emitted).toEqual([
      { type: "direction", direction: "down", source: "wheel" },
    ])

    stop()
  })

  it("emits multiple directions for a single large wheel event", () => {
    const target = new EventTarget()
    const container = makeContainer("vertical")
    const button = container.firstElementChild as HTMLElement

    const emitted: InputAction[] = []
    const stop = createWheelAdapter({ target, deltaThreshold: 80 }).start(
      action => emitted.push(action),
    )

    dispatchWheel(target, { target: button, deltaY: 240 })

    expect(emitted).toEqual([
      { type: "direction", direction: "down", source: "wheel" },
      { type: "direction", direction: "down", source: "wheel" },
      { type: "direction", direction: "down", source: "wheel" },
    ])

    stop()
  })

  it("does nothing when the cursor is outside an opted-in container", () => {
    const target = new EventTarget()
    const div = document.createElement("div")
    document.body.append(div)

    const emitted: InputAction[] = []
    const stop = createWheelAdapter({ target, deltaThreshold: 80 }).start(
      action => emitted.push(action),
    )

    const event = dispatchWheel(target, { target: div, deltaY: 200 })

    expect(emitted).toEqual([])
    expect(event.defaultPrevented).toBe(false)

    stop()
  })

  it("falls back to '2d' for unknown data-pointer-wheel values", () => {
    const target = new EventTarget()
    const container = makeContainer("foo")
    const button = container.firstElementChild as HTMLElement

    const emitted: InputAction[] = []
    const stop = createWheelAdapter({ target, deltaThreshold: 80 }).start(
      action => emitted.push(action),
    )

    dispatchWheel(target, { target: button, deltaX: 100, deltaY: 0 })

    expect(emitted).toEqual([
      { type: "direction", direction: "right", source: "wheel" },
    ])

    stop()
  })

  it("ignores deltaX inside a vertical-only container", () => {
    const target = new EventTarget()
    const container = makeContainer("vertical")
    const button = container.firstElementChild as HTMLElement

    const emitted: InputAction[] = []
    const stop = createWheelAdapter({ target, deltaThreshold: 80 }).start(
      action => emitted.push(action),
    )

    const event = dispatchWheel(target, { target: button, deltaX: 200 })

    expect(emitted).toEqual([])
    // Vertical container did not consume the event — page scroll preserved.
    expect(event.defaultPrevented).toBe(false)

    stop()
  })

  it("disposing removes the listener", () => {
    const target = new EventTarget()
    const container = makeContainer("vertical")
    const button = container.firstElementChild as HTMLElement

    const emitted: InputAction[] = []
    const stop = createWheelAdapter({ target, deltaThreshold: 80 }).start(
      action => emitted.push(action),
    )

    stop()

    dispatchWheel(target, { target: button, deltaY: 200 })

    expect(emitted).toEqual([])
  })
})
