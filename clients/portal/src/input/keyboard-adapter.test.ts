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

    expect(emitted).toEqual([
      { type: "direction", direction: "up", source: "keyboard" },
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

    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true }),
    )

    expect(emitted).toEqual([
      {
        type: "direction",
        direction: "right",
        repeat: true,
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
      { type: "direction", direction: "left", source: "keyboard" },
      { type: "direction", direction: "up", source: "keyboard" },
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
      { type: "direction", direction: "up", source: "keyboard" },
      { type: "options", source: "keyboard" },
    ])

    stop()
  })
})
