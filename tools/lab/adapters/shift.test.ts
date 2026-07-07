import { labTestRegistry } from "./lab-test-registry"
import { afterEach, describe, expect, it } from "bun:test"
import { loadingForeverCatalogFactsSourceLayer } from "@platform/catalog/catalog-facts-source"
import { unknownDeviceState } from "@platform/device/device-facts"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import { deviceStateAtom } from "@platform/react/device/device-atoms"
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
  DEFAULT_SHIFT_NETWORK_READING,
  shiftNetworkReadingAtom,
} from "@product/surfaces/web/shift/shift-network-state"
import {
  DEFAULT_SHIFT_POWER_READING,
  shiftPowerReadingAtom,
} from "@product/surfaces/web/shift/shift-power-state"
import type * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type { Story } from "@simonwjackson/caliper"
import {
  deviceEventsForScreen,
  deviceInputsForScreen,
} from "@simonwjackson/caliper/test-support"
import {
  clearLabSurfaceRegistries,
  registerLabSurfaceRegistry,
} from "@simonwjackson/caliper/adapter-kit"
import { resolveLabSurfaceAdapter } from "@simonwjackson/caliper"

/** The Home page part a mounted "/" screen composes — the story the device
 * inherits its edges from. */
const homePagePart: Story = {
  id: "shift-home-ready",
  layer: "page",
  name: "Home",
  surface: true,
  state: "Ready",
  render: () => null,
}

describe("shift lab surface adapter", () => {
  it("resolves shift with devices and production-shaped atom initial values", async () => {
    const adapter = resolveLabSurfaceAdapter(labTestRegistry(), "shift")

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
    expect(atoms).toContain(shiftPowerReadingAtom)
    expect(atoms).toContain(deviceStateAtom)
    expect(atoms).toContain(shiftClockIsoAtom)
    expect(atoms).toContain(shiftNetworkReadingAtom)
    expect(
      initialValues.find(([atom]) => atom === deviceStateAtom)?.[1],
    ).toMatchObject({ network: { _tag: "Connected" } })
  })

  it("reports unknown surface adapters clearly", () => {
    expect(() => resolveLabSurfaceAdapter(labTestRegistry(), "nope")).toThrow(
      "Unknown lab surface adapter nope",
    )
  })
})

describe("shift home state axes", () => {
  afterEach(() => {
    clearLabSurfaceRegistries()
  })

  const home = () =>
    resolveLabSurfaceAdapter(labTestRegistry(), "shift").axesForScreen?.("/") ?? []

  const homeAxis = (id: string) => {
    const axis = home().find(candidate => candidate.id === id)
    expect(axis).toBeDefined()
    if (!axis) throw new Error(`Missing axis ${id}`)
    return axis
  }

  it("exposes Library and Active Game controls derived from product state", () => {
    const axes = home()
    expect(axes.map(axis => axis.id)).toEqual(["data", "foreground"])

    const data = homeAxis("data")
    const foreground = homeAxis("foreground")
    expect(data.label).toBe("Library")
    expect(foreground.label).toBe("Active game")
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

  it("scopes Library and Active Game state controls to one live device registry", () => {
    const data = homeAxis("data")
    const foreground = homeAxis("foreground")
    const catalogSeed = loadingForeverCatalogFactsSourceLayer
    const foregroundSeed = shiftForegroundSourceLayers.Ready()
    const registryA = AtomRegistry.make({
      initialValues: [
        [catalogFactsSourceLayerAtom, catalogSeed],
        [foregroundSessionStatusLayerAtom, foregroundSeed],
      ],
    })
    const registryB = AtomRegistry.make({
      initialValues: [
        [catalogFactsSourceLayerAtom, catalogSeed],
        [foregroundSessionStatusLayerAtom, foregroundSeed],
      ],
    })
    const seed = new Map<Atom.Atom<unknown>, unknown>([
      [catalogFactsSourceLayerAtom as Atom.Atom<unknown>, catalogSeed],
      [foregroundSessionStatusLayerAtom as Atom.Atom<unknown>, foregroundSeed],
    ])
    const unregisterA = registerLabSurfaceRegistry({
      scopeId: "device-a",
      registry: registryA,
      seed,
    })
    const unregisterB = registerLabSurfaceRegistry({
      scopeId: "device-b",
      registry: registryB,
      seed,
    })

    try {
      data.pin("Empty", { scopeId: "device-a" })
      foreground.pin("Cooling", { scopeId: "device-a" })

      expect(registryA.get(catalogFactsSourceLayerAtom)).not.toBe(catalogSeed)
      expect(registryA.get(foregroundSessionStatusLayerAtom)).not.toBe(
        foregroundSeed,
      )
      expect(registryB.get(catalogFactsSourceLayerAtom)).toBe(catalogSeed)
      expect(registryB.get(foregroundSessionStatusLayerAtom)).toBe(
        foregroundSeed,
      )
    } finally {
      unregisterA()
      unregisterB()
      registryA.dispose()
      registryB.dispose()
    }
  })

  it("keeps clock as the only held live input and drives it on the registry", () => {
    // The device inherits its inputs from the composed Home page part, minus
    // Foreground (covered by the richer axis) — leaving clock, exactly the
    // curated screen-scoped set the adapter used to declare.
    const adapter = resolveLabSurfaceAdapter(labTestRegistry(), "shift")
    const inputs = deviceInputsForScreen(
      adapter,
      "/",
      [homePagePart],
      adapter.axesForScreen?.("/") ?? [],
    )
    expect(inputs.map(input => input.id)).toEqual(["clock"])
    const clock = inputs.find(input => input.id === "clock")
    expect(clock?.control.kind).toBe("iso-datetime")

    const registry = AtomRegistry.make({
      initialValues: [[shiftClockIsoAtom, DEFAULT_SHIFT_CLOCK_ISO]],
    })
    const unregister = registerLabSurfaceRegistry({
      registry,
      seed: new Map<Atom.Atom<unknown>, unknown>([
        [shiftClockIsoAtom as Atom.Atom<unknown>, DEFAULT_SHIFT_CLOCK_ISO],
      ]),
    })

    try {
      clock?.apply?.("2026-06-30T23:08:00.000Z")
      expect(registry.get(shiftClockIsoAtom)).toBe("2026-06-30T23:08:00.000Z")
      clock?.release?.()
      expect(registry.get(shiftClockIsoAtom)).toBe(DEFAULT_SHIFT_CLOCK_ISO)
    } finally {
      unregister()
      registry.dispose()
    }
  })

  it("drives battery and network device events into the live registry", () => {
    const events = deviceEventsForScreen(
      resolveLabSurfaceAdapter(labTestRegistry(), "shift"),
      "/",
      [homePagePart],
    )
    expect(events.map(event => event.id)).toEqual(["battery", "network"])
    const battery = events.find(event => event.id === "battery")
    const network = events.find(event => event.id === "network")
    expect(battery?.payload.kind).toBe("object")
    expect(network?.payload.kind).toBe("tagged")

    const registry = AtomRegistry.make({
      initialValues: [
        [deviceStateAtom, unknownDeviceState()],
        [shiftNetworkReadingAtom, DEFAULT_SHIFT_NETWORK_READING],
      ],
    })
    const unregister = registerLabSurfaceRegistry({
      registry,
      seed: new Map<Atom.Atom<unknown>, unknown>(),
    })

    try {
      battery?.emit({ percent: 12, charging: true })
      network?.emit({ _tag: "Disconnected" })
      expect(registry.get(deviceStateAtom).battery).toMatchObject({
        _tag: "Ready",
        percent: 12,
        charging: true,
      })
      expect(registry.get(deviceStateAtom).network).toEqual({
        _tag: "Disconnected",
        observedAt: expect.any(String),
      })
      expect(registry.get(shiftNetworkReadingAtom)).toEqual(
        DEFAULT_SHIFT_NETWORK_READING,
      )
    } finally {
      unregister()
      registry.dispose()
    }
  })

  it("scopes battery and network events to one live device registry", () => {
    const events = deviceEventsForScreen(
      resolveLabSurfaceAdapter(labTestRegistry(), "shift"),
      "/",
      [homePagePart],
    )
    const battery = events.find(event => event.id === "battery")
    const network = events.find(event => event.id === "network")

    const makeRegistry = () =>
      AtomRegistry.make({
        initialValues: [
          [deviceStateAtom, unknownDeviceState()],
          [shiftNetworkReadingAtom, DEFAULT_SHIFT_NETWORK_READING],
        ],
      })
    const registryA = makeRegistry()
    const registryB = makeRegistry()
    const unregisterA = registerLabSurfaceRegistry({
      scopeId: "device-a",
      registry: registryA,
      seed: new Map<Atom.Atom<unknown>, unknown>(),
    })
    const unregisterB = registerLabSurfaceRegistry({
      scopeId: "device-b",
      registry: registryB,
      seed: new Map<Atom.Atom<unknown>, unknown>(),
    })

    try {
      battery?.emit({ percent: 9, charging: false }, { scopeId: "device-a" })
      network?.emit({ _tag: "Disconnected" }, { scopeId: "device-a" })

      expect(registryA.get(deviceStateAtom).battery).toMatchObject({
        _tag: "Ready",
        percent: 9,
      })
      expect(registryA.get(deviceStateAtom).network).toMatchObject({
        _tag: "Disconnected",
      })
      expect(registryA.get(shiftNetworkReadingAtom)).toEqual(
        DEFAULT_SHIFT_NETWORK_READING,
      )
      expect(registryB.get(deviceStateAtom).battery).toMatchObject({
        _tag: "Unknown",
      })
      expect(registryB.get(deviceStateAtom).network).toMatchObject({
        _tag: "Unknown",
      })
      expect(registryB.get(shiftNetworkReadingAtom)).toEqual(
        DEFAULT_SHIFT_NETWORK_READING,
      )
    } finally {
      unregisterA()
      unregisterB()
      registryA.dispose()
      registryB.dispose()
    }
  })

  it("exposes no axes for screens without a state machine", () => {
    expect(home().length).toBe(2)
    expect(
      resolveLabSurfaceAdapter(labTestRegistry(), "shift").axesForScreen?.("/game/hollow-knight"),
    ).toEqual([])
  })
})

describe("shift capture-back coordinate", () => {
  afterEach(() => {
    setShiftLiveData("Ready")
    setShiftLiveLaunch("Idle")
    setShiftLiveForeground("Ready")
    setShiftLivePower(DEFAULT_SHIFT_POWER_READING)
    setShiftLiveClock(DEFAULT_SHIFT_CLOCK_ISO)
    setShiftLiveNetwork(DEFAULT_SHIFT_NETWORK_READING)
  })

  const capture = () =>
    resolveLabSurfaceAdapter(labTestRegistry(), "shift").captureCoordinate?.("/")

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
