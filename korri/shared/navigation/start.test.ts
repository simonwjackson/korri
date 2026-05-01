import { afterEach, describe, expect, it } from "bun:test"
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

  it("flips to pointer mode on pointer-activity", () => {
    const handle = startSpatialNavigation({
      keyboard: false,
      gamepad: false,
      pointer: false,
      wheel: false,
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

  it("does not change mode on confirm/back/options/menu from keyboard or gamepad", () => {
    const handle = startWithInputMode()

    // Force pointer mode first.
    handle.bus.emit({ type: "pointer-activity", source: "pointer" })
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "pointer",
    )

    handle.bus.emit({ type: "confirm", source: "keyboard" })
    handle.bus.emit({ type: "back", source: "keyboard" })
    handle.bus.emit({ type: "options", source: "gamepad" })
    handle.bus.emit({ type: "menu", source: "gamepad" })

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
