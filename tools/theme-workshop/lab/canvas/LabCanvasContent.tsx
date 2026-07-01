import type { Dispatch, SetStateAction } from "react"
import type { LabCanvasObject } from "../model/lab-canvas-object"
import type {
  LabWorkshopCommandSignal,
  LabWorkshopTool,
} from "../model/lab-canvas-state"
import type { LabStoryIndex } from "../model/lab-part-model"
import type { LabPreviewSelection } from "../model/lab-preview-selection"
import type { LabInputValue } from "../model/lab-source-state"
import { LabWorkspaceView } from "./LabWorkspaceView"

export function LabCanvasContent({
  index,
  objects,
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
  onObjectsChange,
  onDeleteTake,
  onPromoteTake,
  onGenerateTakes,
}: {
  readonly index: LabStoryIndex
  readonly objects: readonly LabCanvasObject[]
  readonly activeSourceId: string
  readonly activeStateId: LabInputValue
  readonly workshopTool: LabWorkshopTool
  readonly workshopCommand: LabWorkshopCommandSignal | null
  /** Which logical screen aspect placed parts render for multi-screen devices. */
  readonly workshopScreenId: string | null
  readonly selectedObjectId: string | null
  readonly previewPickMode: boolean
  readonly previewSelection: LabPreviewSelection | null
  readonly onPreviewSelectionChange: (
    selection: LabPreviewSelection | null,
  ) => void
  readonly onSelectObject: (id: string | null) => void
  readonly onObjectsChange: Dispatch<SetStateAction<readonly LabCanvasObject[]>>
  readonly onDeleteTake: (storyId: string) => void
  readonly onPromoteTake: (storyId: string) => void
  readonly onGenerateTakes: (
    id: string,
    request: { readonly prompt: string; readonly count: number },
  ) => void
}) {
  return (
    <LabWorkspaceView
      index={index}
      objects={objects}
      tool={workshopTool}
      command={workshopCommand}
      screenId={workshopScreenId}
      selectedObjectId={selectedObjectId}
      pickMode={previewPickMode}
      innerSelection={previewSelection}
      onSelectObject={onSelectObject}
      onInnerSelect={onPreviewSelectionChange}
      sourceId={activeSourceId}
      stateId={activeStateId}
      onObjectsChange={onObjectsChange}
      onDeleteTake={onDeleteTake}
      onPromoteTake={onPromoteTake}
      onGenerateTakes={onGenerateTakes}
    />
  )
}
