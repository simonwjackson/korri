import { afterEach, describe, expect, it } from "bun:test"
import {
  getSpatialNavigationSnapshot,
  startSpatialNavigation,
} from "@platform/browser/navigation/start"
import { act, renderHook } from "@testing-library/react"
import { useInputAction } from "./use-input-action"

const startWithoutDeviceAdapters = () =>
  startSpatialNavigation({
    keyboard: false,
    gamepad: false,
    nextFocus: () => null,
  })

const startInAct = (): ReturnType<typeof startSpatialNavigation> => {
  let handle!: ReturnType<typeof startSpatialNavigation>
  act(() => {
    handle = startWithoutDeviceAdapters()
  })
  return handle
}

describe("useInputAction", () => {
  afterEach(() => {
    act(() => {
      getSpatialNavigationSnapshot()?.dispose()
    })
  })

  it("subscribes to the requested action type", () => {
    const handle = startInAct()
    const seen: string[] = []

    renderHook(() =>
      useInputAction("back", () => {
        seen.push("back")
      }),
    )

    act(() => handle.bus.emit({ type: "confirm" }))
    act(() => handle.bus.emit({ type: "back" }))

    expect(seen).toEqual(["back"])
    act(() => handle.dispose())
  })

  it("unsubscribes on unmount", () => {
    const handle = startInAct()
    let count = 0

    const hook = renderHook(() =>
      useInputAction("back", () => {
        count++
      }),
    )

    hook.unmount()
    act(() => handle.bus.emit({ type: "back" }))

    expect(count).toBe(0)
    act(() => handle.dispose())
  })

  it("uses the latest handler after rerender", () => {
    const handle = startInAct()
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
    act(() => handle.dispose())
  })

  it("resubscribes when spatial navigation restarts", () => {
    const first = startInAct()
    const seen: string[] = []

    renderHook(() =>
      useInputAction("back", () => {
        seen.push("back")
      }),
    )

    act(() => first.bus.emit({ type: "back" }))
    const second = startInAct()
    act(() => first.bus.emit({ type: "back" }))
    act(() => second.bus.emit({ type: "back" }))

    expect(seen).toEqual(["back", "back"])
    act(() => second.dispose())
  })

  it("can mount before spatial navigation starts", () => {
    const seen: string[] = []

    renderHook(() =>
      useInputAction("back", () => {
        seen.push("back")
      }),
    )

    const handle = startInAct()
    act(() => handle.bus.emit({ type: "back" }))

    expect(seen).toEqual(["back"])
    act(() => handle.dispose())
  })
})
