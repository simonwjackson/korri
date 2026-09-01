import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  createKeyboardAdapter,
  defaultKeyboardKeyMap,
} from "./keyboard-adapter"
import type { InputAction } from "./types"

describe("createKeyboardAdapter", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("maps arrow keys to directional input and prevents default", () => {
    const target = new EventTarget()
    const emitted: InputAction[] = []
    const stop = createKeyboardAdapter({ target }).start(action =>
      emitted.push(action),
    )

    const event = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    })
    target.dispatchEvent(event)
    target.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp" }))

    expect(emitted).toEqual([
      {
        type: "direction",
        direction: "up",
        releaseExpected: true,
        gestureId: 1,
        source: "keyboard",
      },
      {
        type: "direction-end",
        direction: "up",
        gestureId: 1,
        source: "keyboard",
      },
    ])
    expect(event.defaultPrevented).toBe(true)

    stop()
  })

  it("marks held arrow input as semantic repeat", () => {
    const target = new EventTarget()
    const emitted: InputAction[] = []
    const stop = createKeyboardAdapter({ target }).start(action =>
      emitted.push(action),
    )

    target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true }),
    )

    expect(emitted).toEqual([
      {
        type: "direction",
        direction: "right",
        releaseExpected: true,
        gestureId: 1,
        source: "keyboard",
      },
      {
        type: "direction",
        direction: "right",
        repeat: true,
        releaseExpected: true,
        gestureId: 1,
        source: "keyboard",
      },
    ])
    stop()
  })

  it("ignores a directional release that has no accepted press", () => {
    const target = new EventTarget()
    const emitted: InputAction[] = []
    const stop = createKeyboardAdapter({ target }).start(action => emitted.push(action))

    target.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" }))

    expect(emitted).toEqual([])
    stop()
  })

  it("retires an accepted direction even when another listener prevents keyup", () => {
    const target = new EventTarget()
    const emitted: InputAction[] = []
    target.addEventListener("keyup", event => event.preventDefault())
    const stop = createKeyboardAdapter({ target }).start(action => emitted.push(action))

    target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
    target.dispatchEvent(new KeyboardEvent("keyup", {
      key: "ArrowRight",
      cancelable: true,
    }))
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))

    expect(emitted).toEqual([
      {
        type: "direction",
        direction: "right",
        releaseExpected: true,
        gestureId: 1,
        source: "keyboard",
      },
      {
        type: "direction-end",
        direction: "right",
        gestureId: 1,
        source: "keyboard",
      },
      {
        type: "direction",
        direction: "right",
        releaseExpected: true,
        gestureId: 2,
        source: "keyboard",
      },
    ])
    stop()
  })

  it("quarantines a blurred held key until its stale release arrives", () => {
    const target = new EventTarget()
    const emitted: InputAction[] = []
    const stop = createKeyboardAdapter({ target }).start(action => emitted.push(action))

    target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
    target.dispatchEvent(new Event("blur"))
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
    target.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" }))
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))

    expect(emitted).toEqual([
      {
        type: "direction",
        direction: "right",
        releaseExpected: true,
        gestureId: 1,
        source: "keyboard",
      },
      {
        type: "direction-end",
        direction: "right",
        gestureId: 1,
        source: "keyboard",
      },
      {
        type: "direction",
        direction: "right",
        releaseExpected: true,
        gestureId: 2,
        source: "keyboard",
      },
    ])
    stop()
  })

  it("suppresses held confirm without allowing the native default", () => {
    const target = new EventTarget()
    const emitted: InputAction[] = []
    const stop = createKeyboardAdapter({ target }).start(action => emitted.push(action))
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      repeat: true,
      cancelable: true,
    })

    target.dispatchEvent(event)

    expect(emitted).toEqual([])
    expect(event.defaultPrevented).toBe(true)
    stop()
  })

  it("routes focused horizontal controls through semantic directions", () => {
    const target = new EventTarget()
    const emitted: InputAction[] = []
    const select = document.createElement("select")
    select.dataset.korriHorizontalControl = "choice"
    document.body.append(select)
    select.focus()
    const stop = createKeyboardAdapter({ target }).start(action => emitted.push(action))
    const left = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      cancelable: true,
    })
    const up = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      cancelable: true,
    })

    target.dispatchEvent(left)
    target.dispatchEvent(up)

    expect(emitted).toEqual([
      {
        type: "direction",
        direction: "left",
        releaseExpected: true,
        gestureId: 1,
        source: "keyboard",
      },
      {
        type: "direction",
        direction: "up",
        releaseExpected: true,
        gestureId: 2,
        source: "keyboard",
      },
    ])
    expect(left.defaultPrevented).toBe(true)
    expect(up.defaultPrevented).toBe(true)
    stop()
  })

  it("maps Enter and Space to confirm", () => {
    const target = new EventTarget()
    const emitted: InputAction[] = []
    const stop = createKeyboardAdapter({ target }).start(action =>
      emitted.push(action),
    )

    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
    target.dispatchEvent(new KeyboardEvent("keydown", { key: " " }))

    expect(emitted).toEqual([
      { type: "confirm", source: "keyboard" },
      { type: "confirm", source: "keyboard" },
    ])

    stop()
  })

  it("maps Escape and Backspace to back", () => {
    const target = new EventTarget()
    const emitted: InputAction[] = []
    const stop = createKeyboardAdapter({ target }).start(action =>
      emitted.push(action),
    )

    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }))

    expect(emitted).toEqual([
      { type: "back", source: "keyboard" },
      { type: "back", source: "keyboard" },
    ])

    stop()
  })

  it("does not emit for unmapped keys", () => {
    const target = new EventTarget()
    const emitted: InputAction[] = []
    const stop = createKeyboardAdapter({ target }).start(action =>
      emitted.push(action),
    )

    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }))

    expect(emitted).toEqual([])

    stop()
  })

  it("does not steal keys while an editable element is focused", () => {
    const target = new EventTarget()
    const emitted: InputAction[] = []
    const input = document.createElement("input")
    document.body.append(input)
    input.focus()

    const stop = createKeyboardAdapter({ target }).start(action =>
      emitted.push(action),
    )

    const event = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      cancelable: true,
    })
    target.dispatchEvent(event)

    expect(emitted).toEqual([])
    expect(event.defaultPrevented).toBe(false)

    stop()
  })

  it("allows custom keymaps", () => {
    const target = new EventTarget()
    const emitted: InputAction[] = []
    const stop = createKeyboardAdapter({
      target,
      keymap: {
        ...defaultKeyboardKeyMap,
        direction: { ...defaultKeyboardKeyMap.direction, up: ["KeyW"] },
        options: ["KeyO"],
      },
    }).start(action => emitted.push(action))

    target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }))
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "KeyW" }))
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "KeyO" }))

    expect(emitted).toEqual([
      {
        type: "direction",
        direction: "up",
        releaseExpected: true,
        gestureId: 1,
        source: "keyboard",
      },
      { type: "options", source: "keyboard" },
    ])

    stop()
  })
})
