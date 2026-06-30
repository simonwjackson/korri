import type { Dispatch, SetStateAction } from "react"
import type {
  LabCanvasView,
  LabObjectInstance,
  LabWorkshopCommandSignal,
  LabWorkshopTool,
} from "../model/lab-canvas-state"
import type { LabStoryIndex } from "../model/lab-part-model"
import type { SourceStatus } from "../model/lab-source-state"
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
  onSelectObject,
  onInstancesChange,
}: {
  readonly view: LabCanvasView
  readonly index: LabStoryIndex
  readonly instances: readonly LabObjectInstance[]
  readonly activeSourceId: string
  readonly activeStateId: SourceStatus
  readonly workshopTool: LabWorkshopTool
  readonly workshopCommand: LabWorkshopCommandSignal | null
  /** Which logical screen aspect Compose renders for multi-screen devices. */
  readonly workshopScreenId: string | null
  readonly selectedObjectId: string | null
  readonly onSelectObject: (id: string | null) => void
  readonly onInstancesChange: Dispatch<
    SetStateAction<readonly LabObjectInstance[]>
  >
}) {
  if (view === "device")
    return <LabSurfaceView sourceId={activeSourceId} stateId={activeStateId} />

  return (
    <LabComposeView
      index={index}
      instances={instances}
      tool={workshopTool}
      command={workshopCommand}
      screenId={workshopScreenId}
      selectedObjectId={selectedObjectId}
      onSelectObject={onSelectObject}
      onInstancesChange={onInstancesChange}
    />
  )
}
