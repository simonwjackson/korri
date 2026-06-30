import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import { foregroundSessionStatusLayerAtom } from "@platform/react/library/library-atoms"
import { ShiftCatalogState } from "@product/surfaces/web/shift/catalog/shift-catalog-state"
import { shiftCatalogSourceLayers } from "@product/surfaces/web/shift/shift-catalog-state-samples"
import {
  DEFAULT_SHIFT_CLOCK_ISO,
  SHIFT_CLOCK_PRESETS,
  shiftClockIsoAtom,
} from "@product/surfaces/web/shift/shift-clock-state"
import { readShiftCurrentCoordinate } from "@product/surfaces/web/shift/shift-current-coordinate"
import {
  FOREGROUND_SESSION_GATE_STATE_TAGS,
  shiftForegroundSourceLayers,
} from "@product/surfaces/web/shift/shift-foreground-preview"
import {
  DEFAULT_SHIFT_NETWORK_STATUS,
  SHIFT_NETWORK_STATUS_TAGS,
  type ShiftNetworkStatus,
  shiftNetworkStatusAtom,
} from "@product/surfaces/web/shift/shift-network-state"
import {
  DEFAULT_SHIFT_POWER_STATE,
  SHIFT_POWER_STATE_TAGS,
  type ShiftPowerState,
  shiftPowerStateAtom,
} from "@product/surfaces/web/shift/shift-power-state"
import {
  axisOptionsFromTags,
  type LabScreenCoordinate,
  type LabStateAxis,
} from "../model/lab-state-axis"
import { eachLabSurfaceRegistry } from "../model/lab-surface-registries"

// Shift Home's state regions surfaced as axes. The Data axis drives the REAL
// edge: it sets the surface's own catalog source atom in every mounted registry
// (the same value production injects from the live loader), so the route reads
// only `catalogSnapshotAtom` — no preview side channel. Foreground is the same
// real-edge pattern. Launch is intentionally not an axis: it is produced by
// pressing Play against the real in-memory launcher.

type CatalogSourceLayer = ReturnType<(typeof shiftCatalogSourceLayers)["Ready"]>

const shiftDataAxis: LabStateAxis = {
  id: "data",
  kind: "single",
  label: "Data",
  liveLabel: "Auto",
  states: axisOptionsFromTags(ShiftCatalogState.tags),
  pin: stateId => {
    const make =
      shiftCatalogSourceLayers[stateId as keyof typeof shiftCatalogSourceLayers]
    if (!make) return
    const layer = make()
    eachLabSurfaceRegistry(({ registry }) =>
      registry.set(catalogFactsSourceLayerAtom, layer),
    )
  },
  release: () =>
    eachLabSurfaceRegistry(({ registry, seed }) => {
      const live = seed.get(catalogFactsSourceLayerAtom)
      if (live !== undefined)
        registry.set(catalogFactsSourceLayerAtom, live as CatalogSourceLayer)
    }),
}

type ForegroundSourceLayer = ReturnType<
  (typeof shiftForegroundSourceLayers)["Ready"]
>

const shiftForegroundAxis: LabStateAxis = {
  id: "foreground",
  kind: "single",
  label: "Foreground",
  liveLabel: "Auto",
  states: axisOptionsFromTags(FOREGROUND_SESSION_GATE_STATE_TAGS),
  // Drives the real edge: the surface's foreground status source atom in every
  // mounted registry, the same value production injects from sessiond.
  pin: stateId => {
    const make =
      shiftForegroundSourceLayers[
        stateId as keyof typeof shiftForegroundSourceLayers
      ]
    if (!make) return
    const layer = make()
    eachLabSurfaceRegistry(({ registry }) =>
      registry.set(foregroundSessionStatusLayerAtom, layer),
    )
  },
  release: () =>
    eachLabSurfaceRegistry(({ registry, seed }) => {
      const live = seed.get(foregroundSessionStatusLayerAtom)
      if (live !== undefined)
        registry.set(
          foregroundSessionStatusLayerAtom,
          live as ForegroundSourceLayer,
        )
    }),
}

function isShiftPowerState(value: string): value is ShiftPowerState {
  return SHIFT_POWER_STATE_TAGS.includes(value as ShiftPowerState)
}

function isShiftNetworkStatus(value: string): value is ShiftNetworkStatus {
  return SHIFT_NETWORK_STATUS_TAGS.includes(value as ShiftNetworkStatus)
}

const shiftPowerAxis: LabStateAxis = {
  id: "power",
  kind: "single",
  label: "Power",
  liveLabel: "Auto",
  states: SHIFT_POWER_STATE_TAGS.map(tag => ({ id: tag, label: tag })),
  // Drives the real edge: the Home route reads `shiftPowerStateAtom`; production
  // gets its seeded/default value, while the lab can pin the same atom live.
  pin: stateId => {
    if (!isShiftPowerState(stateId)) return
    eachLabSurfaceRegistry(({ registry }) =>
      registry.set(shiftPowerStateAtom, stateId),
    )
  },
  release: () =>
    eachLabSurfaceRegistry(({ registry, seed }) => {
      const live = seed.get(shiftPowerStateAtom)
      registry.set(
        shiftPowerStateAtom,
        isShiftPowerState(String(live))
          ? (live as ShiftPowerState)
          : DEFAULT_SHIFT_POWER_STATE,
      )
    }),
}

const shiftClockAxis: LabStateAxis = {
  id: "clock",
  kind: "single",
  label: "Clock",
  liveLabel: "Auto",
  states: SHIFT_CLOCK_PRESETS,
  control: { kind: "iso-datetime" },
  // Drives the real edge: the Home route reads `shiftClockIsoAtom`; the lab
  // offers presets, but the product value is an actual ISO date string.
  pin: value => {
    if (!Number.isFinite(new Date(value).getTime())) return
    eachLabSurfaceRegistry(({ registry }) =>
      registry.set(shiftClockIsoAtom, value),
    )
  },
  release: () =>
    eachLabSurfaceRegistry(({ registry, seed }) => {
      const live = seed.get(shiftClockIsoAtom)
      registry.set(
        shiftClockIsoAtom,
        typeof live === "string" && Number.isFinite(new Date(live).getTime())
          ? live
          : DEFAULT_SHIFT_CLOCK_ISO,
      )
    }),
}

const shiftNetworkAxis: LabStateAxis = {
  id: "network",
  kind: "single",
  label: "Network",
  liveLabel: "Auto",
  states: SHIFT_NETWORK_STATUS_TAGS.map(tag => ({ id: tag, label: tag })),
  // Drives the real edge: the Home route reads `shiftNetworkStatusAtom`; the
  // Status Bar renders the matching connected/disconnected icon.
  pin: stateId => {
    if (!isShiftNetworkStatus(stateId)) return
    eachLabSurfaceRegistry(({ registry }) =>
      registry.set(shiftNetworkStatusAtom, stateId),
    )
  },
  release: () =>
    eachLabSurfaceRegistry(({ registry, seed }) => {
      const live = seed.get(shiftNetworkStatusAtom)
      registry.set(
        shiftNetworkStatusAtom,
        isShiftNetworkStatus(String(live))
          ? (live as ShiftNetworkStatus)
          : DEFAULT_SHIFT_NETWORK_STATUS,
      )
    }),
}

export function shiftAxesForScreen(
  screenPath: string,
): readonly LabStateAxis[] {
  return screenPath === "/"
    ? [
        shiftDataAxis,
        shiftForegroundAxis,
        shiftPowerAxis,
        shiftClockAxis,
        shiftNetworkAxis,
      ]
    : []
}

/** Capture the running surface's coordinate as per-axis pins. Launch maps to
 * Live unless Data is Ready (its nesting), so the captured pin round-trips. */
export function shiftCaptureCoordinate(
  screenPath: string,
): LabScreenCoordinate {
  const coordinate = readShiftCurrentCoordinate(screenPath)
  return {
    data: { kind: "single", value: coordinate.data },
    foreground: { kind: "single", value: coordinate.foreground },
    power: { kind: "single", value: coordinate.power },
    clock: { kind: "single", value: coordinate.clock },
    network: { kind: "single", value: coordinate.network },
  }
}
