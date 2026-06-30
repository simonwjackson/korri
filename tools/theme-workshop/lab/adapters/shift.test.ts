import { afterEach, describe, expect, it } from "bun:test"
import { loadingForeverCatalogFactsSourceLayer } from "@platform/catalog/catalog-facts-source"
import { LaunchState } from "@platform/library/launch-state"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import {
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { ShiftCatalogState } from "@product/surfaces/web/shift/catalog/shift-catalog-state"
import { shiftForegroundSourceLayers } from "@product/surfaces/web/shift/shift-foreground-preview"
import {
  getShiftLaunchPreview,
  launchStateSamples,
  setShiftLaunchPreview,
} from "@product/surfaces/web/shift/shift-launch-preview"
import {
  setShiftLiveData,
  setShiftLiveForeground,
} from "@product/surfaces/web/shift/shift-live-coordinate"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { axisEnabled, LAB_AXIS_LIVE } from "../model/lab-state-axis"
import {
  clearLabSurfaceRegistries,
  registerLabSurfaceRegistry,
} from "../model/lab-surface-registries"
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
    clearLabSurfaceRegistries()
    setShiftLaunchPreview(null)
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

  it("drives the real catalog source edge on pin and restores the seed on release", () => {
    const data = homeAxis("data")
    const seed = loadingForeverCatalogFactsSourceLayer
    const registry = AtomRegistry.make({
      initialValues: [[catalogFactsSourceLayerAtom, seed]],
    })
    const unregister = registerLabSurfaceRegistry({
      registry,
      seed: new Map([[catalogFactsSourceLayerAtom, seed]]),
    })

    try {
      // Pin swaps the surface's real source atom (no preview singleton); the
      // route then reads only catalogSnapshotAtom over this new source.
      data.pin("Empty")
      expect(registry.get(catalogFactsSourceLayerAtom)).not.toBe(seed)

      // Release restores the seeded live source it was first mounted with.
      data.release()
      expect(registry.get(catalogFactsSourceLayerAtom)).toBe(seed)
    } finally {
      unregister()
      registry.dispose()
    }
  })

  it("drives the launch preview singleton on pin and clears it on release", () => {
    const launch = homeAxis("launch")

    launch.pin("Launching")
    expect(getShiftLaunchPreview()?._tag).toBe("Launching")

    launch.release()
    expect(getShiftLaunchPreview()).toBeNull()
  })

  it("drives the real foreground source edge on pin and restores the seed on release", () => {
    const foreground = homeAxis("foreground")
    const seed = shiftForegroundSourceLayers.Ready()
    const registry = AtomRegistry.make({
      initialValues: [[foregroundSessionStatusLayerAtom, seed]],
    })
    const unregister = registerLabSurfaceRegistry({
      registry,
      seed: new Map([[foregroundSessionStatusLayerAtom, seed]]),
    })

    try {
      foreground.pin("Cooling")
      expect(registry.get(foregroundSessionStatusLayerAtom)).not.toBe(seed)

      foreground.release()
      expect(registry.get(foregroundSessionStatusLayerAtom)).toBe(seed)
    } finally {
      unregister()
      registry.dispose()
    }
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
    setShiftLiveData("Ready")
    setShiftLiveForeground("Ready")
    setShiftLaunchPreview(null)
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

  it("captures a live Ready + pinned Launching coordinate", () => {
    setShiftLiveData("Ready")
    setShiftLaunchPreview(launchStateSamples.Launching())
    expect(capture()).toEqual({
      data: { kind: "single", value: "Ready" },
      launch: { kind: "single", value: "Launching" },
      foreground: { kind: "single", value: "Ready" },
    })
  })

  it("maps Launch to Live when Data is not Ready (nesting round-trips)", () => {
    setShiftLiveData("Empty")
    expect(capture()).toEqual({
      data: { kind: "single", value: "Empty" },
      launch: { kind: "single", value: LAB_AXIS_LIVE },
      foreground: { kind: "single", value: "Ready" },
    })
  })

  it("captures the live foreground coordinate the route published", () => {
    setShiftLiveForeground("Cooling")
    expect(capture()?.foreground).toEqual({ kind: "single", value: "Cooling" })
  })
})
