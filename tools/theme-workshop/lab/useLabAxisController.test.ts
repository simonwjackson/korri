import { afterEach, describe, expect, it } from "bun:test"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { Story } from "../types"
import { LAB_AXIS_LIVE, type LabStateAxis } from "./model/lab-state-axis"
import type { LabSurfaceAdapter } from "./surface-registry"
import { useLabAxisController } from "./useLabAxisController"

afterEach(() => cleanup())

function makeAdapter() {
  const calls: string[] = []
  const dataAxis: LabStateAxis = {
    id: "data",
    label: "Data",
    liveLabel: "Live",
    states: [
      { id: "Loading", label: "Loading" },
      { id: "Ready", label: "Ready" },
      { id: "Empty", label: "Empty" },
    ],
    pin: tag => calls.push(`data.pin:${tag}`),
    release: () => calls.push("data.release"),
  }
  const launchAxis: LabStateAxis = {
    id: "launch",
    label: "Launch",
    liveLabel: "Live",
    states: [
      { id: "Idle", label: "Idle" },
      { id: "Launching", label: "Launching" },
    ],
    pin: tag => calls.push(`launch.pin:${tag}`),
    release: () => calls.push("launch.release"),
    enabledWhen: active => active.data === "Ready",
  }
  const adapter: LabSurfaceAdapter = {
    id: "test",
    devices: [],
    screens: [
      { label: "Home", path: "/" },
      { label: "Detail", path: "/game/x" },
    ],
    axesForScreen: path => (path === "/" ? [dataAxis, launchAxis] : []),
    captureCoordinate: () => ({ data: "Empty", launch: LAB_AXIS_LIVE }),
    makeSeedInitialValues: async () => ({}),
    mountSurface: () => ({ router: {}, dispose: () => {} }),
  }
  return { adapter, calls }
}

const homePart: Story = {
  id: "home",
  layer: "page",
  name: "Home",
  screenPath: "/",
  render: () => null,
}
const atomPart: Story = {
  id: "pill",
  layer: "atom",
  name: "Pill",
  render: () => null,
}

describe("useLabAxisController", () => {
  it("exposes the active screen's axes and starts Live", () => {
    const { adapter } = makeAdapter()
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    expect(result.current.screenAxes.map(a => a.id)).toEqual(["data", "launch"])
    expect(result.current.mode).toBe("live")
  })

  it("pins an axis, driving its singleton and flipping to Inspect", () => {
    const { adapter, calls } = makeAdapter()
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    act(() => result.current.pinAxis("data", "Empty"))
    expect(calls).toContain("data.pin:Empty")
    expect(result.current.activeByAxis.data).toBe("Empty")
    expect(result.current.mode).toBe("inspect")
  })

  it("releases a now-disabled nested axis when its parent leaves Ready", () => {
    const { adapter, calls } = makeAdapter()
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    act(() => result.current.pinAxis("data", "Ready"))
    act(() => result.current.pinAxis("launch", "Launching"))
    calls.length = 0
    act(() => result.current.liveAxis("data"))
    expect(calls).toContain("launch.release")
    expect(result.current.activeByAxis.launch).toBe(LAB_AXIS_LIVE)
  })

  it("global toggle releases all pins on Live and restores them on Inspect", () => {
    const { adapter, calls } = makeAdapter()
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    act(() => result.current.pinAxis("data", "Empty"))
    act(() => result.current.toggleMode()) // → Live
    expect(result.current.mode).toBe("live")
    calls.length = 0
    act(() => result.current.toggleMode()) // → Inspect
    expect(calls).toContain("data.pin:Empty")
    expect(result.current.activeByAxis.data).toBe("Empty")
  })

  it("applies the captured coordinate on Pin current", () => {
    const { adapter, calls } = makeAdapter()
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    act(() => result.current.pinCurrent?.())
    expect(calls).toContain("data.pin:Empty")
    expect(calls).toContain("launch.release")
    expect(result.current.activeByAxis).toEqual({
      data: "Empty",
      launch: LAB_AXIS_LIVE,
    })
  })

  it("releases the axes when the selection leaves the axis set", () => {
    const { adapter, calls } = makeAdapter()
    const { result, rerender } = renderHook(
      ({ story }: { story: Story | null }) =>
        useLabAxisController(adapter, story),
      { initialProps: { story: homePart as Story | null } },
    )
    act(() => result.current.pinAxis("data", "Empty"))
    calls.length = 0
    act(() => rerender({ story: atomPart }))
    expect(calls).toContain("data.release")
    expect(calls).toContain("launch.release")
  })
})
