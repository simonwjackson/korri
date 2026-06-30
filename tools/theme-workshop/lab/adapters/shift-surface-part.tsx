import { RegistryProvider, useAtomValue } from "@effect/atom-react"
import { makeInMemoryLauncherLayer } from "@platform/library/launcher-layer-memory"
import { makeInMemoryLibrarySourceLayer } from "@platform/library/library-source-layer-memory"
import {
  catalogFactsSourceLayerAtom,
  catalogSnapshotAtom,
} from "@platform/react/catalog/catalog-atoms"
import {
  foregroundSessionGateStateAtom,
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import {
  foregroundStateFromAtom,
  ShiftHomeStateView,
} from "@product/surfaces/web/shift/routes/ShiftHomeRoute"
import { shiftForegroundSourceLayers } from "@product/surfaces/web/shift/shift-foreground-preview"
import type { ReactNode } from "react"
import type { Story } from "../../types"
import type { SourceStatus } from "../model/lab-source-state"
import {
  shiftCatalogLayerForBinding,
  shiftEntriesForBinding,
} from "../seed/shift-seed"

/**
 * Render a placed Shift surface/page part on the Workshop board through the REAL
 * edges, seeded for the object's chosen fixture source + Data state + Foreground
 * state. The part reads `catalogSnapshotAtom` and `foregroundSessionGateStateAtom`
 * (the production atoms); swapping any dial in the object's drag bar re-seeds
 * those atoms, so the same page renders that Data×Foreground combination — the
 * same swap that works in Preview, now per object.
 */
function ShiftHomeFromEdge() {
  const result = useAtomValue(catalogSnapshotAtom)
  const foreground = foregroundStateFromAtom(
    useAtomValue(foregroundSessionGateStateAtom),
  )
  // Render the REAL home composition (the same component the live route
  // renders) — not a static re-implementation. No coordinate owner is passed,
  // so this render-only object does not publish to the capture seam.
  return <ShiftHomeStateView result={result} foreground={foreground} />
}

export function renderShiftSurfacePart(
  _story: Story,
  binding: {
    readonly sourceId: string
    readonly stateId: SourceStatus
    readonly axisStateIds?: Readonly<Record<string, SourceStatus>>
  },
): ReactNode {
  const catalogLayer = shiftCatalogLayerForBinding(
    binding.sourceId,
    binding.stateId,
  )
  const entries = shiftEntriesForBinding(binding.sourceId)
  const foregroundTag = binding.axisStateIds?.foreground ?? "Ready"
  const makeForeground =
    shiftForegroundSourceLayers[
      foregroundTag as keyof typeof shiftForegroundSourceLayers
    ] ?? shiftForegroundSourceLayers.Ready
  // Key on every dial so changing one re-seeds — atom initial values only seed
  // on first render.
  return (
    <RegistryProvider
      key={`${binding.sourceId}:${binding.stateId}:${foregroundTag}`}
      initialValues={[
        [catalogFactsSourceLayerAtom, catalogLayer],
        [foregroundSessionStatusLayerAtom, makeForeground()],
        [
          librarySourceLayerAtom,
          makeInMemoryLibrarySourceLayer({ playableEntries: entries }),
        ],
        [
          launcherLayerAtom,
          makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
        ],
      ]}
    >
      <ShiftHomeFromEdge />
    </RegistryProvider>
  )
}
