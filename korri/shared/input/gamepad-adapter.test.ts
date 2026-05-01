import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { createGamepadAdapter } from "./gamepad-adapter"
import type { InputAction } from "./types"

type MutableGamepadButton = GamepadButton & { pressed: boolean; value: number }

type MutableGamepad = Gamepad & {
  buttons: MutableGamepadButton[]
  axes: number[]
}

let currentTime = 0
let nextRafId = 1
let rafCallbacks = new Map<number, FrameRequestCallback>()
let originalRequestAnimationFrame: typeof globalThis.requestAnimationFrame
let originalCancelAnimationFrame: typeof globalThis.cancelAnimationFrame
let originalNavigatorGetGamepads: PropertyDescriptor | undefined
let originalPerformanceNow: PropertyDescriptor | undefined

function createPad(): MutableGamepad {
  return {
    id: "fake-pad",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    })),
    vibrationActuator: null,
  } as unknown as MutableGamepad
}

function installFrameMocks() {
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    const id = nextRafId++
    rafCallbacks.set(id, callback)
    return id
  }
  globalThis.cancelAnimationFrame = (id: number) => {
    rafCallbacks.delete(id)
  }
  Object.defineProperty(performance, "now", {
    value: () => currentTime,
    configurable: true,
  })
}

function flushFrame(time: number) {
  currentTime = time
  const callbacks = [...rafCallbacks.values()]
  rafCallbacks.clear()
  for (const callback of callbacks) callback(time)
}

function installGamepads(pad: MutableGamepad | null) {
  Object.defineProperty(navigator, "getGamepads", {
    value: () => (pad ? [pad] : []),
    configurable: true,
  })
}

function removeGamepadsApi() {
  Object.defineProperty(navigator, "getGamepads", {
    value: undefined,
    configurable: true,
  })
}

describe("createGamepadAdapter", () => {
  beforeEach(() => {
    currentTime = 0
    nextRafId = 1
    rafCallbacks = new Map()
    originalRequestAnimationFrame = globalThis.requestAnimationFrame
    originalCancelAnimationFrame = globalThis.cancelAnimationFrame
    originalNavigatorGetGamepads = Object.getOwnPropertyDescriptor(
      navigator,
      "getGamepads",
    )
    originalPerformanceNow = Object.getOwnPropertyDescriptor(performance, "now")
    installFrameMocks()
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    if (originalNavigatorGetGamepads) {
      Object.defineProperty(
        navigator,
        "getGamepads",
        originalNavigatorGetGamepads,
      )
    } else {
      Reflect.deleteProperty(navigator, "getGamepads")
    }
    if (originalPerformanceNow) {
      Object.defineProperty(performance, "now", originalPerformanceNow)
    }
  })

  it("emits confirm once per button press", () => {
    const pad = createPad()
    const emitted: InputAction[] = []
    installGamepads(pad)

    const stop = createGamepadAdapter().start(action => emitted.push(action))

    pad.buttons[0].pressed = true
    flushFrame(0)
    flushFrame(20)
    flushFrame(40)

    pad.buttons[0].pressed = false
    flushFrame(60)
    pad.buttons[0].pressed = true
    flushFrame(80)

    expect(emitted).toEqual([{ type: "confirm" }, { type: "confirm" }])

    stop()
  })

  it("repeats held d-pad directions after the configured delay", () => {
    const pad = createPad()
    const emitted: InputAction[] = []
    installGamepads(pad)

    const stop = createGamepadAdapter({
      repeatDelayMs: 100,
      repeatIntervalMs: 50,
    }).start(action => emitted.push(action))

    pad.buttons[12].pressed = true
    flushFrame(0)
    flushFrame(99)
    flushFrame(100)
    flushFrame(149)
    flushFrame(150)

    expect(emitted).toEqual([
      { type: "direction", direction: "up" },
      { type: "direction", direction: "up" },
      { type: "direction", direction: "up" },
    ])

    pad.buttons[12].pressed = false
    flushFrame(200)
    pad.buttons[12].pressed = true
    flushFrame(220)

    expect(emitted).toHaveLength(4)

    stop()
  })

  it("uses the dominant stick axis", () => {
    const pad = createPad()
    const emitted: InputAction[] = []
    installGamepads(pad)

    const stop = createGamepadAdapter({ axisThreshold: 0.5 }).start(action =>
      emitted.push(action),
    )

    pad.axes[0] = 0.8
    pad.axes[1] = 0.4
    flushFrame(0)

    expect(emitted).toEqual([{ type: "direction", direction: "right" }])

    stop()
  })

  it("ignores stick axes below threshold", () => {
    const pad = createPad()
    const emitted: InputAction[] = []
    installGamepads(pad)

    const stop = createGamepadAdapter({ axisThreshold: 0.5 }).start(action =>
      emitted.push(action),
    )

    pad.axes[0] = 0.3
    flushFrame(0)
    pad.axes[0] = 0.6
    flushFrame(20)

    expect(emitted).toEqual([{ type: "direction", direction: "right" }])

    stop()
  })

  it("is safe when the Gamepad API is unavailable", () => {
    removeGamepadsApi()
    const emitted: InputAction[] = []

    const stop = createGamepadAdapter().start(action => emitted.push(action))
    flushFrame(0)
    stop()

    expect(emitted).toEqual([])
  })
})
