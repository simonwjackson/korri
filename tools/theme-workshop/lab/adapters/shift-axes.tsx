import { LaunchState } from "@platform/library/launch-state"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import { foregroundSessionStatusLayerAtom } from "@platform/react/library/library-atoms"
import { ShiftCatalogState } from "@product/surfaces/web/shift/catalog/shift-catalog-state"
import { shiftCatalogSourceLayers } from "@product/surfaces/web/shift/shift-catalog-state-samples"
import { readShiftCurrentCoordinate } from "@product/surfaces/web/shift/shift-current-coordinate"
import {
  FOREGROUND_SESSION_GATE_STATE_TAGS,
  shiftForegroundSourceLayers,
} from "@product/surfaces/web/shift/shift-foreground-preview"
import {
  launchStateSamples,
  setShiftLaunchPreview,
} from "@product/surfaces/web/shift/shift-launch-preview"
import {
  axisOptionsFromTags,
  LAB_AXIS_LIVE,
  type LabScreenCoordinate,
  type LabStateAxis,
  pinFromTable,
} from "../model/lab-state-axis"
import { eachLabSurfaceRegistry } from "../model/lab-surface-registries"

// Shift Home's state regions surfaced as axes. The Data axis drives the REAL
// edge: it sets the surface's own catalog source atom in every mounted registry
// (the same value production injects from the live loader), so the route reads
// only `catalogSnapshotAtom` — no preview side channel. Launch/foreground still
// use their preview singletons pending the same treatment.

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

const shiftLaunchAxis: LabStateAxis = {
  id: "launch",
  kind: "single",
  label: "Launch",
  liveLabel: "Auto",
  states: axisOptionsFromTags(LaunchState.tags),
  pin: pinFromTable(launchStateSamples, setShiftLaunchPreview),
  release: () => setShiftLaunchPreview(null),
  // The cinematic home (and its launch overlay) only exists in the Ready body.
  parent: { axisId: "data", whenStates: ["Ready"] },
  disabledHint: "Only while Data = Ready",
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

export function shiftAxesForScreen(
  screenPath: string,
): readonly LabStateAxis[] {
  return screenPath === "/"
    ? [shiftDataAxis, shiftLaunchAxis, shiftForegroundAxis]
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
    launch: {
      kind: "single",
      value: coordinate.data === "Ready" ? coordinate.launch : LAB_AXIS_LIVE,
    },
    foreground: { kind: "single", value: coordinate.foreground },
  }
}
