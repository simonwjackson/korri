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
