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
  axisOptionsFromTags,
  type LabScreenCoordinate,
  type LabStateAxis,
} from "../model/lab-state-axis"
import { eachLabSurfaceRegistry } from "../model/lab-surface-registries"

// Shift Home's state regions surfaced as axes. Data and Foreground are real
// state-machine regions. Power, Clock, and Network are product inputs instead,
// so they are declared through the surface input contract in shift.ts.

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
  return screenPath === "/" ? [shiftDataAxis, shiftForegroundAxis] : []
}

export function shiftCaptureCoordinate(
  screenPath: string,
): LabScreenCoordinate {
  const coordinate = readShiftCurrentCoordinate(screenPath)
  return {
    data: { kind: "single", value: coordinate.data },
    foreground: { kind: "single", value: coordinate.foreground },
  }
}
