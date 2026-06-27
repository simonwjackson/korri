import { afterEach, describe, expect, it } from "bun:test"
import { LaunchState } from "@platform/library/launch-state"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import {
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { ShiftCatalogState } from "@product/surfaces/web/shift/catalog/shift-catalog-state"
import {
  getShiftCatalogPreview,
  setShiftCatalogPreview,
} from "@product/surfaces/web/shift/shift-catalog-preview"
import { shiftCatalogStateSamples } from "@product/surfaces/web/shift/shift-catalog-state-samples"
import {
  foregroundStateSamples,
  getShiftForegroundPreview,
  setShiftForegroundPreview,
} from "@product/surfaces/web/shift/shift-foreground-preview"
import {
  getShiftLaunchPreview,
  launchStateSamples,
  setShiftLaunchPreview,
} from "@product/surfaces/web/shift/shift-launch-preview"
import { axisEnabled, LAB_AXIS_LIVE } from "../model/lab-state-axis"
import { resolveLabSurfaceAdapter } from "../surface-registry"

describe("shift lab surface adapter", () => {
  it("resolves shift with devices and production-shaped atom initial values", async () => {
    const adapter = resolveLabSurfaceAdapter("shift")

    expect(adapter.id).toBe("shift")
    expect(adapter.devices.length).toBeGreaterThan(0)
    expect(adapter.devices.map(device => device.id)).toContain("rg353m")

    const initialValues =
      (await adapter.makeSeedInitialValues()) as readonly (readonly [
        unknown,
        unknown,
      ])[]
    const atoms = initialValues.map(([atom]) => atom)

    expect(atoms).toContain(catalogFactsSourceLayerAtom)
    expect(atoms).toContain(librarySourceLayerAtom)
    expect(atoms).toContain(launcherLayerAtom)
  })

  it("reports unknown surface adapters clearly", () => {
    expect(() => resolveLabSurfaceAdapter("nope")).toThrow(
      "Unknown lab surface adapter nope",
    )
  })
})

describe("shift home state axes", () => {
  afterEach(() => {
    setShiftCatalogPreview(null)
    setShiftLaunchPreview(null)
    setShiftForegroundPreview(null)
  })

  const home = () =>
    resolveLabSurfaceAdapter("shift").axesForScreen?.("/") ?? []

  const homeAxis = (id: string) => {
    const axis = home().find(candidate => candidate.id === id)
    expect(axis).toBeDefined()
    if (!axis) throw new Error(`Missing axis ${id}`)
    return axis
  }

  it("exposes Data and Launch axes derived from their machine tags", () => {
    const axes = home()
    expect(axes.map(axis => axis.id)).toEqual(["data", "launch", "foreground"])

    const data = homeAxis("data")
    const launch = homeAxis("launch")
    const foreground = homeAxis("foreground")
    expect(data.kind).toBe("single")
    expect(launch.kind).toBe("single")
    expect(launch.parent).toEqual({ axisId: "data", whenStates: ["Ready"] })
    expect(foreground.kind).toBe("single")
    expect(foreground.parent).toBeUndefined()
    expect(data.states.map(state => state.id)).toEqual([
      ...ShiftCatalogState.tags,
    ])
    expect(launch.states.map(state => state.id)).toEqual([...LaunchState.tags])
    expect(foreground.states.map(state => state.id)).toEqual([
      "Ready",
      "Preparing",
      "Running",
      "Cooling",
      "Recovering",
      "Unknown",
      "LoadError",
    ])
  })

  it("greys the Launch axis unless Data is Ready (nested axes)", () => {
    const launch = homeAxis("launch")
    expect(
      axisEnabled(launch, { data: { kind: "single", value: "Ready" } }),
    ).toBe(true)
    expect(
      axisEnabled(launch, { data: { kind: "single", value: "Empty" } }),
    ).toBe(false)
  })

  it("drives the catalog preview singleton on pin and clears it on release", () => {
    const data = homeAxis("data")

    data.pin("Empty")
    const pinned = getShiftCatalogPreview()
    expect(pinned).not.toBeNull()
    if (!pinned) throw new Error("Expected catalog preview to be pinned")
    expect(ShiftCatalogState.fromResult(pinned)._tag).toBe("Empty")

    data.release()
    expect(getShiftCatalogPreview()).toBeNull()
  })

  it("drives the launch preview singleton on pin and clears it on release", () => {
    const launch = homeAxis("launch")

    launch.pin("Launching")
    expect(getShiftLaunchPreview()?._tag).toBe("Launching")

    launch.release()
    expect(getShiftLaunchPreview()).toBeNull()
  })

  it("drives the foreground preview singleton on pin and clears it on release", () => {
    const foreground = homeAxis("foreground")

    foreground.pin("Cooling")
    expect(getShiftForegroundPreview()?._tag).toBe("Cooling")

    foreground.release()
    expect(getShiftForegroundPreview()).toBeNull()
  })

  it("exposes no axes for screens without a state machine", () => {
    expect(home().length).toBe(3)
    expect(
      resolveLabSurfaceAdapter("shift").axesForScreen?.("/game/hollow-knight"),
    ).toEqual([])
  })
})

describe("shift capture-back coordinate", () => {
  afterEach(() => {
    setShiftCatalogPreview(null)
    setShiftLaunchPreview(null)
    setShiftForegroundPreview(null)
  })

  const capture = () =>
    resolveLabSurfaceAdapter("shift").captureCoordinate?.("/")

  it("captures the seed's resting coordinate when nothing is pinned", () => {
    expect(capture()).toEqual({
      data: { kind: "single", value: "Ready" },
      launch: { kind: "single", value: "Idle" },
      foreground: { kind: "single", value: "Ready" },
    })
  })

  it("captures a pinned Ready + Launching coordinate", () => {
    setShiftCatalogPreview(shiftCatalogStateSamples.Ready())
    setShiftLaunchPreview(launchStateSamples.Launching())
    expect(capture()).toEqual({
      data: { kind: "single", value: "Ready" },
      launch: { kind: "single", value: "Launching" },
      foreground: { kind: "single", value: "Ready" },
    })
  })

  it("maps Launch to Live when Data is not Ready (nesting round-trips)", () => {
    setShiftCatalogPreview(shiftCatalogStateSamples.Empty())
    expect(capture()).toEqual({
      data: { kind: "single", value: "Empty" },
      launch: { kind: "single", value: LAB_AXIS_LIVE },
      foreground: { kind: "single", value: "Ready" },
    })
  })

  it("captures a pinned foreground coordinate", () => {
    setShiftForegroundPreview(foregroundStateSamples.Cooling())
    expect(capture()?.foreground).toEqual({ kind: "single", value: "Cooling" })
  })
})
