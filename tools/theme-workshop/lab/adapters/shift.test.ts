import { afterEach, describe, expect, it } from "bun:test"
import { loadingForeverCatalogFactsSourceLayer } from "@platform/catalog/catalog-facts-source"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import {
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { ShiftCatalogState } from "@product/surfaces/web/shift/catalog/shift-catalog-state"
import { shiftForegroundSourceLayers } from "@product/surfaces/web/shift/shift-foreground-preview"
import {
  setShiftLiveData,
  setShiftLiveForeground,
  setShiftLiveLaunch,
} from "@product/surfaces/web/shift/shift-live-coordinate"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
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
  })

  const home = () =>
    resolveLabSurfaceAdapter("shift").axesForScreen?.("/") ?? []

  const homeAxis = (id: string) => {
    const axis = home().find(candidate => candidate.id === id)
    expect(axis).toBeDefined()
    if (!axis) throw new Error(`Missing axis ${id}`)
    return axis
  }

  it("exposes Data and Foreground axes derived from their machine tags", () => {
    const axes = home()
    expect(axes.map(axis => axis.id)).toEqual(["data", "foreground"])

    const data = homeAxis("data")
    const foreground = homeAxis("foreground")
    expect(data.kind).toBe("single")
    expect(foreground.kind).toBe("single")
    expect(foreground.parent).toBeUndefined()
    expect(data.states.map(state => state.id)).toEqual([
      ...ShiftCatalogState.tags,
    ])
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

  it("does not expose Launch as a lab axis because launch is produced by Play", () => {
    expect(home().some(axis => axis.id === "launch")).toBe(false)
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
    expect(home().length).toBe(2)
    expect(
      resolveLabSurfaceAdapter("shift").axesForScreen?.("/game/hollow-knight"),
    ).toEqual([])
  })
})

describe("shift capture-back coordinate", () => {
  afterEach(() => {
    setShiftLiveData("Ready")
    setShiftLiveLaunch("Idle")
    setShiftLiveForeground("Ready")
  })

  const capture = () =>
    resolveLabSurfaceAdapter("shift").captureCoordinate?.("/")

  it("captures the seed's resting coordinate when nothing is pinned", () => {
    expect(capture()).toEqual({
      data: { kind: "single", value: "Ready" },
      foreground: { kind: "single", value: "Ready" },
    })
  })

  it("does not capture Launch as an Inspect pin", () => {
    setShiftLiveLaunch("Launching")
    expect(capture()).toEqual({
      data: { kind: "single", value: "Ready" },
      foreground: { kind: "single", value: "Ready" },
    })
  })

  it("captures the live foreground coordinate the route published", () => {
    setShiftLiveForeground("Cooling")
    expect(capture()?.foreground).toEqual({ kind: "single", value: "Cooling" })
  })
})
