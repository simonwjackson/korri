import type {
  LabCanvasView,
  LabObjectInstance,
  LabWorkshopCommandSignal,
  LabWorkshopTool,
} from "../model/lab-canvas-state"
import type { LabStoryIndex } from "../model/lab-part-model"
import type { LabSourceOption, SourceStatus } from "../model/lab-source-state"
import type { LabPartsCatalog } from "../parts-discovery"
import { LabComposeView } from "./LabComposeView"
import { LabSurfaceView } from "./LabSurfaceView"

export function LabCanvasContent({
  view,
  catalog,
  index,
  selectedIds,
  instances,
  sources,
  activeSourceId,
  activeStateId,
  workshopTool,
  workshopCommand,
  workshopScreenId,
  onSelectStory,
  onInstancesChange,
}: {
  readonly view: LabCanvasView
  readonly catalog: LabPartsCatalog | null
  readonly index: LabStoryIndex
  readonly selectedIds: readonly string[]
  readonly instances: readonly LabObjectInstance[]
  readonly sources: readonly LabSourceOption[]
  readonly activeSourceId: string
  readonly activeStateId: SourceStatus
  readonly workshopTool: LabWorkshopTool
  readonly workshopCommand: LabWorkshopCommandSignal | null
  /** Which logical screen aspect Compose renders for multi-screen devices. */
  readonly workshopScreenId: string | null
  readonly onSelectStory: (storyId: string) => void
  readonly onInstancesChange: (instances: readonly LabObjectInstance[]) => void
}) {
  if (view === "device")
    return <LabSurfaceView sourceId={activeSourceId} stateId={activeStateId} />

  return (
    <LabComposeView
      catalog={catalog}
      index={index}
      selectedIds={selectedIds}
      instances={instances}
      sources={sources}
      tool={workshopTool}
      command={workshopCommand}
      screenId={workshopScreenId}
      onSelectStory={onSelectStory}
      onInstancesChange={onInstancesChange}
    />
  )
}
