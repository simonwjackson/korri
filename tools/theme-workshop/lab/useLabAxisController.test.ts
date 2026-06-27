import { afterEach, describe, expect, it } from "bun:test"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { Story } from "../types"
import {
  LAB_AXIS_LIVE,
  type LabScreenCoordinate,
  type LabStateAxis,
} from "./model/lab-state-axis"
import type { LabSurfaceAdapter } from "./surface-registry"
import { useLabAxisController } from "./useLabAxisController"

afterEach(() => cleanup())

function makeAdapter(
  captureCoordinate: () => LabScreenCoordinate = () => ({
    data: { kind: "single", value: "Empty" },
    launch: { kind: "single", value: LAB_AXIS_LIVE },
    overlays: { kind: "multi", values: ["Notice", "Toast"] },
  }),
) {
  const calls: string[] = []
  const dataAxis: LabStateAxis = {
    id: "data",
    kind: "single",
    label: "Data",
    liveLabel: "Auto",
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
    kind: "single",
    label: "Launch",
    liveLabel: "Auto",
    states: [
      { id: "Idle", label: "Idle" },
      { id: "Launching", label: "Launching" },
    ],
    pin: tag => calls.push(`launch.pin:${tag}`),
    release: () => calls.push("launch.release"),
    parent: { axisId: "data", whenStates: ["Ready"] },
  }
  const overlaysAxis: LabStateAxis = {
    id: "overlays",
    kind: "multi",
    label: "Overlays",
    liveLabel: "Auto",
    states: [
      { id: "Notice", label: "Notice" },
      { id: "Toast", label: "Toast" },
    ],
    pin: tag => calls.push(`overlays.pin:${tag}`),
    release: () => calls.push("overlays.release:*"),
  }
  const adapter: LabSurfaceAdapter = {
    id: "test",
    devices: [],
    screens: [
      { label: "Home", path: "/" },
      { label: "Detail", path: "/game/x" },
    ],
    axesForScreen: path =>
      path === "/" ? [dataAxis, launchAxis, overlaysAxis] : [],
    captureCoordinate,
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
    expect(result.current.screenAxes.map(a => a.id)).toEqual([
      "data",
      "launch",
      "overlays",
    ])
    expect(result.current.mode).toBe("live")
  })

  it("pins a single axis, driving its singleton and flipping to Inspect", () => {
    const { adapter, calls } = makeAdapter()
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    act(() => result.current.pinAxis("data", "Empty"))
    expect(calls).toContain("data.pin:Empty")
    expect(result.current.activeByAxis.data).toEqual({
      kind: "single",
      value: "Empty",
    })
    expect(result.current.mode).toBe("inspect")
  })

  it("adds multi axis states and clears them on Live", () => {
    const { adapter, calls } = makeAdapter()
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    act(() => result.current.pinAxis("overlays", "Notice"))
    act(() => result.current.pinAxis("overlays", "Toast"))
    expect(calls).toContain("overlays.pin:Notice")
    expect(calls).toContain("overlays.pin:Toast")
    expect(result.current.activeByAxis.overlays).toEqual({
      kind: "multi",
      on: new Set(["Notice", "Toast"]),
    })
    act(() => result.current.liveAxis("overlays"))
    expect(calls).toContain("overlays.release:*")
    expect(result.current.activeByAxis.overlays).toEqual({
      kind: "multi",
      on: new Set(),
    })
  })

  it("toggles one active multi state off", () => {
    const { adapter, calls } = makeAdapter()
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    act(() => result.current.pinAxis("overlays", "Notice"))
    act(() => result.current.pinAxis("overlays", "Toast"))
    calls.length = 0
    act(() => result.current.pinAxis("overlays", "Notice"))
    expect(calls).toContain("overlays.release:*")
    expect(calls).toContain("overlays.pin:Toast")
    expect(result.current.activeByAxis.overlays).toEqual({
      kind: "multi",
      on: new Set(["Toast"]),
    })
  })

  it("replaces stale multi preview states when capturing current", () => {
    const { adapter, calls } = makeAdapter(() => ({
      data: { kind: "single", value: "Ready" },
      launch: { kind: "single", value: LAB_AXIS_LIVE },
      overlays: { kind: "multi", values: ["Toast"] },
    }))
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    act(() => result.current.pinAxis("overlays", "Notice"))
    calls.length = 0
    act(() => result.current.pinCurrent?.())
    expect(calls).toContain("overlays.release:*")
    expect(calls).toContain("overlays.pin:Toast")
    expect(result.current.activeByAxis.overlays).toEqual({
      kind: "multi",
      on: new Set(["Toast"]),
    })
  })

  it("releases a now-disabled nested axis when its parent leaves Ready", () => {
    const { adapter, calls } = makeAdapter()
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    act(() => result.current.pinAxis("data", "Ready"))
    act(() => result.current.pinAxis("launch", "Launching"))
    calls.length = 0
    act(() => result.current.liveAxis("data"))
    expect(calls).toContain("launch.release")
    expect(result.current.activeByAxis.launch).toEqual({
      kind: "single",
      value: LAB_AXIS_LIVE,
    })
  })

  it("releases a nested axis when its parent is pinned away from Ready", () => {
    const { adapter, calls } = makeAdapter()
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    act(() => result.current.pinAxis("data", "Ready"))
    act(() => result.current.pinAxis("launch", "Launching"))
    calls.length = 0
    act(() => result.current.pinAxis("data", "Empty"))
    expect(calls).toContain("launch.release")
    expect(result.current.activeByAxis.launch).toEqual({
      kind: "single",
      value: LAB_AXIS_LIVE,
    })
  })

  it("cleans disabled nested pins to a fixed point regardless of adapter order", () => {
    const calls: string[] = []
    const parent: LabStateAxis = {
      id: "parent",
      kind: "single",
      label: "Parent",
      liveLabel: "Auto",
      states: [
        { id: "Open", label: "Open" },
        { id: "Closed", label: "Closed" },
      ],
      pin: tag => calls.push(`parent.pin:${tag}`),
      release: () => calls.push("parent.release"),
    }
    const child: LabStateAxis = {
      id: "child",
      kind: "single",
      label: "Child",
      liveLabel: "Auto",
      states: [{ id: "Open", label: "Open" }],
      parent: { axisId: "parent", whenStates: ["Open"] },
      pin: tag => calls.push(`child.pin:${tag}`),
      release: () => calls.push("child.release"),
    }
    const grandchild: LabStateAxis = {
      id: "grandchild",
      kind: "single",
      label: "Grandchild",
      liveLabel: "Auto",
      states: [{ id: "Dirty", label: "Dirty" }],
      parent: { axisId: "child", whenStates: ["Open"] },
      pin: tag => calls.push(`grandchild.pin:${tag}`),
      release: () => calls.push("grandchild.release"),
    }
    const adapter: LabSurfaceAdapter = {
      id: "deep",
      devices: [],
      screens: [{ label: "Home", path: "/" }],
      axesForScreen: () => [grandchild, child, parent],
      makeSeedInitialValues: async () => ({}),
      mountSurface: () => ({ router: {}, dispose: () => {} }),
    }
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    act(() => result.current.pinAxis("parent", "Open"))
    act(() => result.current.pinAxis("child", "Open"))
    act(() => result.current.pinAxis("grandchild", "Dirty"))
    calls.length = 0
    act(() => result.current.pinAxis("parent", "Closed"))
    expect(calls).toContain("child.release")
    expect(calls).toContain("grandchild.release")
    expect(result.current.activeByAxis.child).toEqual({
      kind: "single",
      value: LAB_AXIS_LIVE,
    })
    expect(result.current.activeByAxis.grandchild).toEqual({
      kind: "single",
      value: LAB_AXIS_LIVE,
    })
  })

  it("global toggle releases all pins on Live and restores single and multi pins on Inspect", () => {
    const { adapter, calls } = makeAdapter()
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    act(() => result.current.pinAxis("data", "Empty"))
    act(() => result.current.pinAxis("overlays", "Notice"))
    act(() => result.current.toggleMode()) // → Live
    expect(result.current.mode).toBe("live")
    calls.length = 0
    act(() => result.current.toggleMode()) // → Inspect
    expect(calls).toContain("data.pin:Empty")
    expect(calls).toContain("overlays.pin:Notice")
    expect(result.current.activeByAxis.data).toEqual({
      kind: "single",
      value: "Empty",
    })
    expect(result.current.activeByAxis.overlays).toEqual({
      kind: "multi",
      on: new Set(["Notice"]),
    })
  })

  it("applies the captured coordinate on Pin current", () => {
    const { adapter, calls } = makeAdapter()
    const { result } = renderHook(() => useLabAxisController(adapter, null))
    act(() => result.current.pinCurrent?.())
    expect(calls).toContain("data.pin:Empty")
    expect(calls).toContain("launch.release")
    expect(calls).toContain("overlays.pin:Notice")
    expect(calls).toContain("overlays.pin:Toast")
    expect(result.current.activeByAxis).toEqual({
      data: { kind: "single", value: "Empty" },
      launch: { kind: "single", value: LAB_AXIS_LIVE },
      overlays: { kind: "multi", on: new Set(["Notice", "Toast"]) },
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
    expect(calls).toContain("overlays.release:*")
  })
})
