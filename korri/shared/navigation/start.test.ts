import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import type { InputAction } from "@shared/input/types"
import {
  getInputBus,
  getSpatialNavigation,
  getSpatialNavigationSnapshot,
  startSpatialNavigation,
  subscribeSpatialNavigation,
} from "./start"

const startWithoutDeviceAdapters = () =>
  startSpatialNavigation({
    keyboard: false,
    gamepad: false,
    pointer: false,
    wheel: false,
    native: false,
    inputMode: false,
    nextFocus: () => null,
  })

describe("spatial navigation singleton", () => {
  afterEach(() => {
    getSpatialNavigationSnapshot()?.dispose()
  })

  it("throws when read before initialization", () => {
    expect(() => getSpatialNavigation()).toThrow(/startSpatialNavigation/)
  })

  it("exposes the currently started handle", () => {
    const handle = startWithoutDeviceAdapters()

    expect(getSpatialNavigation()).toBe(handle)
    expect(getInputBus()).toBe(handle.bus)

    handle.dispose()
  })

  it("clears the singleton when the active handle is disposed", () => {
    const handle = startWithoutDeviceAdapters()
    handle.dispose()

    expect(() => getSpatialNavigation()).toThrow(/startSpatialNavigation/)
    expect(getSpatialNavigationSnapshot()).toBeNull()
  })

  it("notifies subscribers when the singleton changes", () => {
    const seen: Array<boolean> = []
    const unsubscribe = subscribeSpatialNavigation(handle => {
      seen.push(!!handle)
    })

    const handle = startWithoutDeviceAdapters()
    handle.dispose()
    unsubscribe()

    expect(seen).toEqual([true, false])
  })

  it("disposes the previous singleton before replacing it", () => {
    let disposed = false
    const first = startSpatialNavigation({
      keyboard: false,
      gamepad: false,
      pointer: false,
      wheel: false,
      native: false,
      inputMode: false,
      nextFocus: () => null,
    })
    first.bus.use({
      name: "test-adapter",
      start() {
        return () => {
          disposed = true
        }
      },
    })

    const second = startWithoutDeviceAdapters()

    expect(disposed).toBe(true)
    expect(getSpatialNavigation()).toBe(second)

    second.dispose()
  })

  it("does not let an old handle clear a newer one", () => {
    const first = startWithoutDeviceAdapters()
    const second = startWithoutDeviceAdapters()

    first.dispose()
    expect(getSpatialNavigation()).toBe(second)

    second.dispose()
  })
})

describe("input-mode dispatch", () => {
  afterEach(() => {
    getSpatialNavigationSnapshot()?.dispose()
    document.documentElement.removeAttribute("data-input-mode")
  })

  const startWithInputMode = () =>
    startSpatialNavigation({
      keyboard: false,
      gamepad: false,
      pointer: false,
      wheel: false,
      native: false,
      nextFocus: () => null,
    })

  it("writes the initial input-mode attribute on start", () => {
    const handle = startWithInputMode()

    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "pointer",
    )
    expect(handle.inputMode?.getMode()).toBe("pointer")
  })

  it("flips to directional mode on a keyboard direction action", () => {
    const handle = startWithInputMode()

    handle.bus.emit({ type: "direction", direction: "up", source: "keyboard" })

    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "directional",
    )
  })

  it("flips to directional mode on a gamepad direction action", () => {
    const handle = startWithInputMode()

    handle.bus.emit({
      type: "direction",
      direction: "left",
      source: "gamepad",
    })

    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "directional",
    )
  })

  it("flips to directional mode on a native direction action", () => {
    const handle = startWithInputMode()

    handle.bus.emit({
      type: "direction",
      direction: "right",
      source: "native",
    })

    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "directional",
    )
  })

  it("flips to pointer mode on pointer-activity", () => {
    const handle = startSpatialNavigation({
      keyboard: false,
      gamepad: false,
      pointer: false,
      wheel: false,
      native: false,
      nextFocus: () => null,
    })

    handle.bus.emit({
      type: "direction",
      direction: "up",
      source: "keyboard",
    })
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "directional",
    )

    handle.bus.emit({ type: "pointer-activity", source: "pointer" })
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "pointer",
    )
  })

  it("flips to pointer mode when wheel emits a direction (wheel is pointer-driven)", () => {
    const handle = startWithInputMode()

    handle.bus.emit({
      type: "direction",
      direction: "up",
      source: "keyboard",
    })
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "directional",
    )

    handle.bus.emit({
      type: "direction",
      direction: "down",
      source: "wheel",
    })
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "pointer",
    )
  })

  it("does not change mode on confirm/back/options/menu from directional sources", () => {
    const handle = startWithInputMode()

    // Force pointer mode first.
    handle.bus.emit({ type: "pointer-activity", source: "pointer" })
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "pointer",
    )

    handle.bus.emit({ type: "confirm", source: "keyboard" })
    handle.bus.emit({ type: "back", source: "keyboard" })
    handle.bus.emit({ type: "options", source: "gamepad" })
    handle.bus.emit({ type: "menu", source: "native" })

    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "pointer",
    )
  })

  it("does not change mode for untagged synthetic emits", () => {
    const handle = startWithInputMode()

    handle.bus.emit({ type: "direction", direction: "up" })

    // Started in pointer mode, no source → no flip.
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "pointer",
    )
  })

  it("removes the data-input-mode attribute on dispose", () => {
    const handle = startWithInputMode()

    expect(document.documentElement.hasAttribute("data-input-mode")).toBe(true)

    handle.dispose()

    expect(document.documentElement.hasAttribute("data-input-mode")).toBe(false)
  })

  it("omits the input-mode store when inputMode: false", () => {
    const handle = startSpatialNavigation({
      keyboard: false,
      gamepad: false,
      pointer: false,
      wheel: false,
      native: false,
      inputMode: false,
      nextFocus: () => null,
    })

    expect(handle.inputMode).toBeNull()
    expect(document.documentElement.hasAttribute("data-input-mode")).toBe(false)

    handle.bus.emit({
      type: "direction",
      direction: "up",
      source: "keyboard",
    })

    expect(document.documentElement.hasAttribute("data-input-mode")).toBe(false)
  })
})

describe("active focus attribute wiring", () => {
  afterEach(() => {
    getSpatialNavigationSnapshot()?.dispose()
    document.body.innerHTML = ""
    document.documentElement.removeAttribute("data-input-mode")
  })

  const startForActiveFocus = (
    options: Parameters<typeof startSpatialNavigation>[0] = {},
  ) =>
    startSpatialNavigation({
      keyboard: false,
      gamepad: false,
      pointer: false,
      wheel: false,
      native: false,
      inputMode: false,
      nextFocus: () => null,
      ...options,
    })

  it("marks the focused element with a data attribute", () => {
    document.body.innerHTML = `
      <button id="first">First</button>
      <button id="second">Second</button>
    `
    const first = document.getElementById("first") as HTMLButtonElement
    const second = document.getElementById("second") as HTMLButtonElement
    startForActiveFocus()

    first.focus()
    expect(first.hasAttribute("data-korri-active-focus")).toBe(true)

    second.focus()
    expect(first.hasAttribute("data-korri-active-focus")).toBe(false)
    expect(second.hasAttribute("data-korri-active-focus")).toBe(true)
  })

  it("removes the active focus attribute on dispose", () => {
    document.body.innerHTML = `<button id="first">First</button>`
    const first = document.getElementById("first") as HTMLButtonElement
    const handle = startForActiveFocus()

    first.focus()
    handle.dispose()

    expect(first.hasAttribute("data-korri-active-focus")).toBe(false)
  })

  it("can disable active focus attribute mirroring", () => {
    document.body.innerHTML = `<button id="first">First</button>`
    const first = document.getElementById("first") as HTMLButtonElement
    startForActiveFocus({ activeFocusAttribute: false })

    first.focus()

    expect(first.hasAttribute("data-korri-active-focus")).toBe(false)
  })
})

describe("focus retention wiring", () => {
  afterEach(() => {
    getSpatialNavigationSnapshot()?.dispose()
    document.body.innerHTML = ""
    document.documentElement.removeAttribute("data-input-mode")
  })

  const setupButtons = () => {
    document.body.innerHTML = `
      <button id="first">First</button>
      <button id="second">Second</button>
    `
    return {
      first: document.getElementById("first") as HTMLButtonElement,
      second: document.getElementById("second") as HTMLButtonElement,
    }
  }

  const startForFocusRetention = (
    options: Parameters<typeof startSpatialNavigation>[0] = {},
  ) =>
    startSpatialNavigation({
      keyboard: false,
      gamepad: false,
      pointer: false,
      wheel: false,
      native: false,
      inputMode: false,
      nextFocus: () => null,
      ...options,
    })

  it("installs focus retention by default", async () => {
    const { first } = setupButtons()
    startForFocusRetention()

    first.focus()
    first.blur()
    await Promise.resolve()

    expect(document.activeElement).toBe(first)
  })

  it("does not install focus retention when focusRetention is false", async () => {
    const { first } = setupButtons()
    startForFocusRetention({ focusRetention: false })

    first.focus()
    first.blur()
    await Promise.resolve()

    expect(document.activeElement).toBe(document.body)
  })

  it("disposes focus retention with the spatial navigation handle", async () => {
    const { first } = setupButtons()
    const handle = startForFocusRetention()

    first.focus()
    handle.dispose()
    first.blur()
    await Promise.resolve()

    expect(document.activeElement).toBe(document.body)
  })

  it("uses the restored element as the next direction origin", async () => {
    const { first, second } = setupButtons()
    const origins: string[] = []
    const handle = startForFocusRetention({
      nextFocus: current => {
        origins.push((current as HTMLElement | null)?.id ?? "none")
        return second
      },
    })

    first.focus()
    first.blur()
    await Promise.resolve()

    handle.bus.emit({ type: "direction", direction: "right" })

    expect(origins).toEqual(["first"])
    expect(document.activeElement).toBe(second)
  })

  it("does not emit input actions or change input mode when restoring focus", async () => {
    const { first } = setupButtons()
    const seen: InputAction[] = []
    const handle = startSpatialNavigation({
      keyboard: false,
      gamepad: false,
      pointer: false,
      wheel: false,
      native: false,
      nextFocus: () => null,
    })
    handle.bus.on(action => seen.push(action))

    handle.bus.emit({ type: "direction", direction: "up", source: "keyboard" })
    first.focus()
    first.blur()
    await Promise.resolve()

    expect(document.activeElement).toBe(first)
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "directional",
    )
    expect(seen).toEqual([
      { type: "direction", direction: "up", source: "keyboard" },
    ])
  })
})

describe("controller profile wiring", () => {
  let frameMocks: FrameMocks

  beforeEach(() => {
    frameMocks = installFrameMocks()
  })

  afterEach(() => {
    getSpatialNavigationSnapshot()?.dispose()
    frameMocks.restore()
  })

  it("uses browser gamepad for controller auto mode without native input", () => {
    const pad = createPad()
    const seen: InputAction[] = []
    installGamepads(pad)

    const handle = startSpatialNavigation({
      keyboard: false,
      pointer: false,
      wheel: false,
      native: false,
      inputMode: false,
      controller: "auto",
      nextFocus: () => null,
    })
    handle.bus.on(action => seen.push(action))

    pad.buttons[0].pressed = true
    frameMocks.flush(0)

    expect(seen).toEqual([{ type: "confirm", source: "gamepad" }])
  })

  it("uses native input only for controller auto mode with native input", async () => {
    const pad = createPad()
    const server = createInputServer()
    const seen: InputAction[] = []
    installGamepads(pad)

    const handle = startSpatialNavigation({
      keyboard: false,
      pointer: false,
      wheel: false,
      inputMode: false,
      controller: {
        profile: "auto",
        native: { url: `ws://127.0.0.1:${server.port}` },
      },
      nextFocus: () => null,
    })
    handle.bus.on(action => seen.push(action))

    pad.buttons[0].pressed = true
    frameMocks.flush(0)
    expect(seen).toEqual([])

    await waitFor(() => server.messages.length > 0, "native subscription")
    server.send({
      kind: "input",
      deviceId: "inputplumber-virtual-xbox360",
      class: "gamepad",
      type: 1,
      code: 304,
      value: 1,
      timestamp: Date.now(),
    })

    await waitFor(() => seen.length === 1, "native confirm action")
    expect(seen).toEqual([{ type: "confirm", source: "native" }])

    server.stop()
  })

  it("can explicitly disable controller input while keeping keyboard enabled", () => {
    const pad = createPad()
    const seen: InputAction[] = []
    installGamepads(pad)

    const handle = startSpatialNavigation({
      pointer: false,
      wheel: false,
      native: false,
      inputMode: false,
      controller: false,
      nextFocus: () => null,
    })
    handle.bus.on(action => seen.push(action))

    pad.buttons[0].pressed = true
    frameMocks.flush(0)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))

    expect(seen).toEqual([{ type: "confirm", source: "keyboard" }])
  })

  it("uses desktop bridge input for controller auto mode with desktop input", () => {
    const seen: InputAction[] = []
    let listener: ((action: InputAction) => void) | undefined
    const handle = startSpatialNavigation({
      keyboard: false,
      pointer: false,
      wheel: false,
      native: false,
      inputMode: false,
      controller: {
        profile: "auto",
        desktop: {
          bridge: {
            subscribeAction(next) {
              listener = next
              return () => {}
            },
          },
        },
      },
      nextFocus: () => null,
    })
    handle.bus.on(action => seen.push(action))

    listener?.({ type: "confirm", source: "native" })

    expect(seen).toEqual([{ type: "confirm", source: "native" }])
  })

  it("supports explicit debug-both mode", async () => {
    const pad = createPad()
    const server = createInputServer()
    const seen: InputAction[] = []
    installGamepads(pad)

    const handle = startSpatialNavigation({
      keyboard: false,
      pointer: false,
      wheel: false,
      inputMode: false,
      controller: {
        profile: "debug-both",
        native: { url: `ws://127.0.0.1:${server.port}` },
      },
      nextFocus: () => null,
    })
    handle.bus.on(action => seen.push(action))

    pad.buttons[0].pressed = true
    frameMocks.flush(0)

    await waitFor(() => server.messages.length > 0, "native subscription")
    server.send({
      kind: "input",
      deviceId: "inputplumber-virtual-xbox360",
      class: "gamepad",
      type: 1,
      code: 304,
      value: 1,
      timestamp: Date.now(),
    })

    await waitFor(() => seen.length === 2, "both controller actions")
    expect(seen).toEqual([
      { type: "confirm", source: "gamepad" },
      { type: "confirm", source: "native" },
    ])

    server.stop()
  })
})

describe("native adapter wiring", () => {
  afterEach(() => {
    getSpatialNavigationSnapshot()?.dispose()
  })

  it("attaches the native adapter when native options are provided", async () => {
    const server = createInputServer()
    const seen: InputAction[] = []
    const handle = startSpatialNavigation({
      keyboard: false,
      gamepad: false,
      pointer: false,
      wheel: false,
      inputMode: false,
      native: { url: `ws://127.0.0.1:${server.port}` },
      nextFocus: () => null,
    })
    handle.bus.on(action => seen.push(action))

    await waitFor(() => server.messages.length > 0, "native subscription")
    server.send({
      kind: "input",
      deviceId: "inputplumber-virtual-xbox360",
      class: "gamepad",
      type: 1,
      code: 304,
      value: 1,
      timestamp: Date.now(),
    })

    await waitFor(() => seen.length === 1, "native confirm action")
    expect(seen).toEqual([{ type: "confirm", source: "native" }])

    server.stop()
  })

  it("does not attach the native adapter when native is false", async () => {
    const server = createInputServer()
    startSpatialNavigation({
      keyboard: false,
      gamepad: false,
      pointer: false,
      wheel: false,
      native: false,
      inputMode: false,
      nextFocus: () => null,
    })

    await Bun.sleep(30)

    expect(server.messages).toEqual([])
    server.stop()
  })

  it("does not attach the native adapter when native is omitted", async () => {
    const server = createInputServer()
    startSpatialNavigation({
      keyboard: false,
      gamepad: false,
      pointer: false,
      wheel: false,
      inputMode: false,
      nextFocus: () => null,
    })

    await Bun.sleep(30)

    expect(server.messages).toEqual([])
    server.stop()
  })
})

type MutableGamepadButton = GamepadButton & {
  pressed: boolean
  value: number
}

type MutableGamepad = Gamepad & {
  buttons: MutableGamepadButton[]
  axes: number[]
}

type FrameMocks = {
  flush: (time: number) => void
  restore: () => void
}

function createPad(): MutableGamepad {
  return {
    id: "fake-pad",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0, 0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    })),
    vibrationActuator: null,
  } as unknown as MutableGamepad
}

function installGamepads(pad: MutableGamepad | null) {
  Object.defineProperty(navigator, "getGamepads", {
    value: () => (pad ? [pad] : []),
    configurable: true,
  })
}

function installFrameMocks(): FrameMocks {
  let currentTime = 0
  let nextRafId = 1
  let callbacks = new Map<number, FrameRequestCallback>()
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  const originalNavigatorGetGamepads = Object.getOwnPropertyDescriptor(
    navigator,
    "getGamepads",
  )
  const originalPerformanceNow = Object.getOwnPropertyDescriptor(
    performance,
    "now",
  )

  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    const id = nextRafId++
    callbacks.set(id, callback)
    return id
  }
  globalThis.cancelAnimationFrame = (id: number) => {
    callbacks.delete(id)
  }
  Object.defineProperty(performance, "now", {
    value: () => currentTime,
    configurable: true,
  })

  return {
    flush(time) {
      currentTime = time
      const pending = [...callbacks.values()]
      callbacks = new Map()
      for (const callback of pending) callback(time)
    },
    restore() {
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
    },
  }
}

type InputServer = {
  readonly port: number
  readonly messages: unknown[]
  readonly send: (message: unknown) => void
  readonly stop: () => void
}

function createInputServer(): InputServer {
  const sockets = new Set<Bun.ServerWebSocket<{ readonly id: string }>>()
  const messages: unknown[] = []
  const server = Bun.serve<{ readonly id: string }>({
    port: 0,
    fetch(request, server) {
      if (server.upgrade(request, { data: { id: crypto.randomUUID() } }))
        return undefined
      return new Response("native input test server\n")
    },
    websocket: {
      open(socket) {
        sockets.add(socket)
      },
      message(_socket, message) {
        messages.push(JSON.parse(String(message)))
      },
      close(socket) {
        sockets.delete(socket)
      },
    },
  })

  return {
    port: server.port ?? 0,
    messages,
    send(message) {
      const payload = JSON.stringify(message)
      for (const socket of sockets) socket.send(payload)
    },
    stop() {
      server.stop(true)
    },
  }
}

async function waitFor(
  predicate: () => boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await Bun.sleep(5)
  }
  throw new Error(`timed out waiting for ${description}`)
}
