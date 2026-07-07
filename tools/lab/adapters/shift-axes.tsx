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
  type LabStateAxisContext,
} from "@simonwjackson/caliper/adapter-kit"
import {
  eachLabSurfaceRegistry,
  eachLabSurfaceRegistryForScope,
  type LabSurfaceRegistryEntry,
} from "@simonwjackson/caliper/adapter-kit"

// Shift Home's screen-state controls. These are real product state machines,
// scoped by the selected live device when the lab is editing one.

type CatalogSourceLayer = ReturnType<(typeof shiftCatalogSourceLayers)["Ready"]>
type ForegroundSourceLayer = ReturnType<
  (typeof shiftForegroundSourceLayers)["Ready"]
>

function eachTargetRegistry(
  context: LabStateAxisContext | undefined,
  run: (entry: LabSurfaceRegistryEntry) => void,
): void {
  if (context?.scopeId) {
    eachLabSurfaceRegistryForScope(context.scopeId, run)
    return
  }
  eachLabSurfaceRegistry(run)
}

const shiftLibraryAxis: LabStateAxis = {
  id: "data",
  kind: "single",
  label: "Library",
  liveLabel: "Live",
  states: axisOptionsFromTags(ShiftCatalogState.tags),
  pin: (stateId, context) => {
    const make =
      shiftCatalogSourceLayers[stateId as keyof typeof shiftCatalogSourceLayers]
    if (!make) return
    const layer = make()
    eachTargetRegistry(context, ({ registry }) =>
      registry.set(catalogFactsSourceLayerAtom, layer),
    )
  },
  release: context =>
    eachTargetRegistry(context, ({ registry, seed }) => {
      const live = seed.get(catalogFactsSourceLayerAtom)
      if (live !== undefined)
        registry.set(catalogFactsSourceLayerAtom, live as CatalogSourceLayer)
    }),
}

const shiftActiveGameAxis: LabStateAxis = {
  id: "foreground",
  kind: "single",
  label: "Active game",
  liveLabel: "Live",
  states: axisOptionsFromTags(FOREGROUND_SESSION_GATE_STATE_TAGS),
  pin: (stateId, context) => {
    const make =
      shiftForegroundSourceLayers[
        stateId as keyof typeof shiftForegroundSourceLayers
      ]
    if (!make) return
    const layer = make()
    eachTargetRegistry(context, ({ registry }) =>
      registry.set(foregroundSessionStatusLayerAtom, layer),
    )
  },
  release: context =>
    eachTargetRegistry(context, ({ registry, seed }) => {
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
  return screenPath === "/" ? [shiftLibraryAxis, shiftActiveGameAxis] : []
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
