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
  })

  const home = () =>
    resolveLabSurfaceAdapter("shift").axesForScreen?.("/") ?? []

  it("exposes Data and Launch axes derived from their machine tags", () => {
    const axes = home()
    expect(axes.map(axis => axis.id)).toEqual(["data", "launch"])

    const data = axes.find(axis => axis.id === "data")!
    const launch = axes.find(axis => axis.id === "launch")!
    expect(data.states.map(state => state.id)).toEqual([
      ...ShiftCatalogState.tags,
    ])
    expect(launch.states.map(state => state.id)).toEqual([...LaunchState.tags])
  })

  it("greys the Launch axis unless Data is Ready (nested axes)", () => {
    const launch = home().find(axis => axis.id === "launch")!
    expect(axisEnabled(launch, { data: "Ready" })).toBe(true)
    expect(axisEnabled(launch, { data: "Empty" })).toBe(false)
  })

  it("drives the catalog preview singleton on pin and clears it on release", () => {
    const data = home().find(axis => axis.id === "data")!

    data.pin("Empty")
    const pinned = getShiftCatalogPreview()
    expect(pinned).not.toBeNull()
    expect(ShiftCatalogState.fromResult(pinned!)._tag).toBe("Empty")

    data.release()
    expect(getShiftCatalogPreview()).toBeNull()
  })

  it("drives the launch preview singleton on pin and clears it on release", () => {
    const launch = home().find(axis => axis.id === "launch")!

    launch.pin("Launching")
    expect(getShiftLaunchPreview()?._tag).toBe("Launching")

    launch.release()
    expect(getShiftLaunchPreview()).toBeNull()
  })

  it("exposes no axes for screens without a state machine", () => {
    expect(home().length).toBe(2)
    expect(
      resolveLabSurfaceAdapter("shift").axesForScreen?.("/game/hollow-knight"),
    ).toEqual([])
  })
})

describe("shift capture-back coordinate", () => {
  afterEach(() => {
    setShiftCatalogPreview(null)
    setShiftLaunchPreview(null)
  })

  const capture = () =>
    resolveLabSurfaceAdapter("shift").captureCoordinate?.("/")

  it("captures the seed's resting coordinate when nothing is pinned", () => {
    expect(capture()).toEqual({ data: "Ready", launch: "Idle" })
  })

  it("captures a pinned Ready + Launching coordinate", () => {
    setShiftCatalogPreview(shiftCatalogStateSamples.Ready())
    setShiftLaunchPreview(launchStateSamples.Launching())
    expect(capture()).toEqual({ data: "Ready", launch: "Launching" })
  })

  it("maps Launch to Live when Data is not Ready (nesting round-trips)", () => {
    setShiftCatalogPreview(shiftCatalogStateSamples.Empty())
    expect(capture()).toEqual({ data: "Empty", launch: LAB_AXIS_LIVE })
  })
})
