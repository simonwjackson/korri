import { afterEach, describe, expect, it } from "bun:test"
import { loadingForeverCatalogFactsSourceLayer } from "@platform/catalog/catalog-facts-source"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import {
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { ShiftCatalogState } from "@product/surfaces/web/shift/catalog/shift-catalog-state"
import {
  DEFAULT_SHIFT_CLOCK_ISO,
  shiftClockIsoAtom,
} from "@product/surfaces/web/shift/shift-clock-state"
import { shiftForegroundSourceLayers } from "@product/surfaces/web/shift/shift-foreground-preview"
import {
  setShiftLiveClock,
  setShiftLiveData,
  setShiftLiveForeground,
  setShiftLiveLaunch,
  setShiftLiveNetwork,
  setShiftLivePower,
} from "@product/surfaces/web/shift/shift-live-coordinate"
import {
  DEFAULT_SHIFT_NETWORK_STATUS,
  shiftNetworkStatusAtom,
} from "@product/surfaces/web/shift/shift-network-state"
import {
  DEFAULT_SHIFT_POWER_STATE,
  shiftPowerStateAtom,
} from "@product/surfaces/web/shift/shift-power-state"
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
    expect(atoms).toContain(shiftPowerStateAtom)
    expect(atoms).toContain(shiftClockIsoAtom)
    expect(atoms).toContain(shiftNetworkStatusAtom)
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

  it("exposes Data, Foreground, Power, Clock, and Network axes derived from product state", () => {
    const axes = home()
    expect(axes.map(axis => axis.id)).toEqual([
      "data",
      "foreground",
      "power",
      "clock",
      "network",
    ])

    const data = homeAxis("data")
    const foreground = homeAxis("foreground")
    const power = homeAxis("power")
    const clock = homeAxis("clock")
    const network = homeAxis("network")
    expect(data.kind).toBe("single")
    expect(foreground.kind).toBe("single")
    expect(power.kind).toBe("single")
    expect(clock.kind).toBe("single")
    expect(network.kind).toBe("single")
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
    expect(power.states.map(state => state.id)).toEqual([
      "Full",
      "Medium",
      "Low",
      "Charging",
    ])
    expect(clock.states.map(state => state.id)).toEqual([
      "2026-06-30T09:41:00.000Z",
      "2026-06-30T16:24:00.000Z",
      "2026-06-30T23:08:00.000Z",
    ])
    expect(network.states.map(state => state.id)).toEqual([
      "Connected",
      "Disconnected",
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

  it("drives the real power edge on pin and restores the seed on release", () => {
    const power = homeAxis("power")
    const registry = AtomRegistry.make({
      initialValues: [[shiftPowerStateAtom, DEFAULT_SHIFT_POWER_STATE]],
    })
    const unregister = registerLabSurfaceRegistry({
      registry,
      seed: new Map([[shiftPowerStateAtom, DEFAULT_SHIFT_POWER_STATE]]),
    })

    try {
      power.pin("Charging")
      expect(registry.get(shiftPowerStateAtom)).toBe("Charging")

      power.release()
      expect(registry.get(shiftPowerStateAtom)).toBe(DEFAULT_SHIFT_POWER_STATE)
    } finally {
      unregister()
      registry.dispose()
    }
  })

  it("drives the real clock edge on pin and restores the seed on release", () => {
    const clock = homeAxis("clock")
    const registry = AtomRegistry.make({
      initialValues: [[shiftClockIsoAtom, DEFAULT_SHIFT_CLOCK_ISO]],
    })
    const unregister = registerLabSurfaceRegistry({
      registry,
      seed: new Map([[shiftClockIsoAtom, DEFAULT_SHIFT_CLOCK_ISO]]),
    })

    try {
      clock.pin("2026-06-30T23:08:00.000Z")
      expect(registry.get(shiftClockIsoAtom)).toBe("2026-06-30T23:08:00.000Z")

      clock.release()
      expect(registry.get(shiftClockIsoAtom)).toBe(DEFAULT_SHIFT_CLOCK_ISO)
    } finally {
      unregister()
      registry.dispose()
    }
  })

  it("drives the real network edge on pin and restores the seed on release", () => {
    const network = homeAxis("network")
    const registry = AtomRegistry.make({
      initialValues: [[shiftNetworkStatusAtom, DEFAULT_SHIFT_NETWORK_STATUS]],
    })
    const unregister = registerLabSurfaceRegistry({
      registry,
      seed: new Map([[shiftNetworkStatusAtom, DEFAULT_SHIFT_NETWORK_STATUS]]),
    })

    try {
      network.pin("Disconnected")
      expect(registry.get(shiftNetworkStatusAtom)).toBe("Disconnected")

      network.release()
      expect(registry.get(shiftNetworkStatusAtom)).toBe(
        DEFAULT_SHIFT_NETWORK_STATUS,
      )
    } finally {
      unregister()
      registry.dispose()
    }
  })

  it("exposes no axes for screens without a state machine", () => {
    expect(home().length).toBe(5)
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
    setShiftLivePower(DEFAULT_SHIFT_POWER_STATE)
    setShiftLiveClock(DEFAULT_SHIFT_CLOCK_ISO)
    setShiftLiveNetwork(DEFAULT_SHIFT_NETWORK_STATUS)
  })

  const capture = () =>
    resolveLabSurfaceAdapter("shift").captureCoordinate?.("/")

  it("captures the seed's resting coordinate when nothing is pinned", () => {
    expect(capture()).toEqual({
      data: { kind: "single", value: "Ready" },
      foreground: { kind: "single", value: "Ready" },
      power: { kind: "single", value: "Medium" },
      clock: { kind: "single", value: "2026-06-30T16:24:00.000Z" },
      network: { kind: "single", value: "Connected" },
    })
  })

  it("does not capture Launch as an Inspect pin", () => {
    setShiftLiveLaunch("Launching")
    expect(capture()).toEqual({
      data: { kind: "single", value: "Ready" },
      foreground: { kind: "single", value: "Ready" },
      power: { kind: "single", value: "Medium" },
      clock: { kind: "single", value: "2026-06-30T16:24:00.000Z" },
      network: { kind: "single", value: "Connected" },
    })
  })

  it("captures the live foreground coordinate the route published", () => {
    setShiftLiveForeground("Cooling")
    expect(capture()?.foreground).toEqual({ kind: "single", value: "Cooling" })
  })

  it("captures the live power coordinate the route published", () => {
    setShiftLivePower("Charging")
    expect(capture()?.power).toEqual({ kind: "single", value: "Charging" })
  })

  it("captures the live clock coordinate the route published", () => {
    setShiftLiveClock("2026-06-30T23:08:00.000Z")
    expect(capture()?.clock).toEqual({
      kind: "single",
      value: "2026-06-30T23:08:00.000Z",
    })
  })

  it("captures the live network coordinate the route published", () => {
    setShiftLiveNetwork("Disconnected")
    expect(capture()?.network).toEqual({
      kind: "single",
      value: "Disconnected",
    })
  })
})
