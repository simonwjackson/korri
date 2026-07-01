import type { Dispatch, SetStateAction } from "react"
import type {
  LabCanvasView,
  LabObjectInstance,
  LabWorkshopCommandSignal,
  LabWorkshopTool,
} from "../model/lab-canvas-state"
import type { LabStoryIndex } from "../model/lab-part-model"
import type { LabPreviewSelection } from "../model/lab-preview-selection"
import type { LabInputValue } from "../model/lab-source-state"
import { LabComposeView } from "./LabComposeView"
import { LabSurfaceView } from "./LabSurfaceView"

export function LabCanvasContent({
  view,
  index,
  instances,
  activeSourceId,
  activeStateId,
  workshopTool,
  workshopCommand,
  workshopScreenId,
  selectedObjectId,
  previewPickMode,
  previewSelection,
  onPreviewSelectionChange,
  onSelectObject,
  onInstancesChange,
}: {
  readonly view: LabCanvasView
  readonly index: LabStoryIndex
  readonly instances: readonly LabObjectInstance[]
  readonly activeSourceId: string
  readonly activeStateId: LabInputValue
  readonly workshopTool: LabWorkshopTool
  readonly workshopCommand: LabWorkshopCommandSignal | null
  /** Which logical screen aspect Compose renders for multi-screen devices. */
  readonly workshopScreenId: string | null
  readonly selectedObjectId: string | null
  readonly previewPickMode: boolean
  readonly previewSelection: LabPreviewSelection | null
  readonly onPreviewSelectionChange: (
    selection: LabPreviewSelection | null,
  ) => void
  readonly onSelectObject: (id: string | null) => void
  readonly onInstancesChange: Dispatch<
    SetStateAction<readonly LabObjectInstance[]>
  >
}) {
  if (view === "device")
    return (
      <LabSurfaceView
        sourceId={activeSourceId}
        stateId={activeStateId}
        pickMode={previewPickMode}
        previewSelection={previewSelection}
        onPreviewSelectionChange={onPreviewSelectionChange}
      />
    )

  return (
    <LabComposeView
      index={index}
      instances={instances}
      tool={workshopTool}
      command={workshopCommand}
      screenId={workshopScreenId}
      selectedObjectId={selectedObjectId}
      pickMode={previewPickMode}
      innerSelection={previewSelection}
      onSelectObject={onSelectObject}
      onInnerSelect={onPreviewSelectionChange}
      onInstancesChange={onInstancesChange}
    />
  )
}
