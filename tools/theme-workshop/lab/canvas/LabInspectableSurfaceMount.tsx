import { LabSurfaceMount } from "../LabSurfaceMount"
import type { LabPreviewSelection } from "../model/lab-preview-selection"
import type {
  LabSurfaceAdapter,
  LabSurfaceDualScreenOptions,
} from "../surface-registry"
import { LabInspectableContent } from "./LabInspectableContent"

export function LabInspectableSurfaceMount({
  scopeId,
  adapter,
  initialValues,
  surfacePath,
  onNavigate,
  dualScreen,
  pickMode,
  selection,
  onSelect,
}: {
  readonly scopeId: string
  readonly adapter: LabSurfaceAdapter
  readonly initialValues: unknown
  readonly surfacePath: string
  readonly onNavigate: (surfacePath: string) => void
  readonly dualScreen?: LabSurfaceDualScreenOptions
  readonly pickMode: boolean
  readonly selection: LabPreviewSelection | null
  readonly onSelect: (selection: LabPreviewSelection | null) => void
}) {
  return (
    <LabInspectableContent
      scopeId={scopeId}
      pickMode={pickMode}
      selection={selection}
      onSelect={onSelect}
    >
      <LabSurfaceMount
        adapter={adapter}
        initialValues={initialValues}
        surfacePath={surfacePath}
        onNavigate={onNavigate}
        dualScreen={dualScreen}
      />
    </LabInspectableContent>
  )
}
