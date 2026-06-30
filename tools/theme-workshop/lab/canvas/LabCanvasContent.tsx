import type {
  LabCanvasView,
  LabObjectInstance,
  LabWorkshopCommandSignal,
  LabWorkshopTool,
} from "../model/lab-canvas-state"
import type { LabStoryIndex } from "../model/lab-part-model"
import type { LabSourceOption, SourceStatus } from "../model/lab-source-state"
import type { LabPartsCatalog } from "../parts-discovery"
import { LabGalleryView } from "./LabGalleryView"
import { LabSurfaceView } from "./LabSurfaceView"
import { LabWorkshopBoard } from "./LabWorkshopBoard"

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
  /** Which screen of the active device the Workshop renders (multi-screen). */
  readonly workshopScreenId: string | null
  readonly onSelectStory: (storyId: string) => void
  readonly onInstancesChange: (instances: readonly LabObjectInstance[]) => void
}) {
  if (view === "preview")
    return <LabSurfaceView sourceId={activeSourceId} stateId={activeStateId} />
  if (view === "gallery")
    return (
      <LabGalleryView
        catalog={catalog}
        index={index}
        selectedIds={selectedIds}
        onSelect={onSelectStory}
      />
    )
  // Workshop: a single spatial board holding 0..n placed parts, each rendered
  // in the active device frame. The live, router-mounted surface is the Preview
  // view; the workshop is static, isolated previews.
  return (
    <LabWorkshopBoard
      instances={instances}
      stories={index.byId}
      sources={sources}
      tool={workshopTool}
      command={workshopCommand}
      screenId={workshopScreenId}
      onInstancesChange={onInstancesChange}
    />
  )
}
