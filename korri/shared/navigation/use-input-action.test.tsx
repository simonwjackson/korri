import { describe, expect, it } from "bun:test"
import { act, renderHook } from "@testing-library/react"
import { startSpatialNavigation } from "./start"
import { useInputAction } from "./use-input-action"

const startWithoutDeviceAdapters = () =>
  startSpatialNavigation({
    keyboard: false,
    gamepad: false,
    nextFocus: () => null,
  })

describe("useInputAction", () => {
  it("subscribes to the requested action type", () => {
    const handle = startWithoutDeviceAdapters()
    const seen: string[] = []

    renderHook(() =>
      useInputAction("back", () => {
        seen.push("back")
      }),
    )

    act(() => handle.bus.emit({ type: "confirm" }))
    act(() => handle.bus.emit({ type: "back" }))

    expect(seen).toEqual(["back"])
    handle.dispose()
  })

  it("unsubscribes on unmount", () => {
    const handle = startWithoutDeviceAdapters()
    let count = 0

    const hook = renderHook(() =>
      useInputAction("back", () => {
        count++
      }),
    )

    hook.unmount()
    act(() => handle.bus.emit({ type: "back" }))

    expect(count).toBe(0)
    handle.dispose()
  })

  it("uses the latest handler after rerender", () => {
    const handle = startWithoutDeviceAdapters()
    const seen: string[] = []

    const hook = renderHook(
      ({ prefix }: { prefix: string }) =>
        useInputAction("back", () => {
          seen.push(prefix)
        }),
      { initialProps: { prefix: "first" } },
    )

    hook.rerender({ prefix: "second" })
    act(() => handle.bus.emit({ type: "back" }))

    expect(seen).toEqual(["second"])
    handle.dispose()
  })
})
