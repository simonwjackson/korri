import type { Story } from "../../types"
import type { LabPartsCatalog } from "../parts-discovery"
import type { LabCanvasView, LabObjectInstance } from "../model/lab-canvas-state"
import type { LabStoryIndex } from "../model/lab-part-model"
import type { LabSourceOption, LabStateOption, SourceStatus } from "../model/lab-source-state"
import { useLab } from "../Lab.context"
import { LabCanvasBoard } from "./LabCanvasBoard"
import { LabGalleryView } from "./LabGalleryView"
import { LabMatrixView } from "./LabMatrixView"
import { LabSelectionView } from "./LabSelectionView"
import { LabSurfaceView } from "./LabSurfaceView"

export function LabCanvasContent({
  view,
  catalog,
  index,
  selectedIds,
  instances,
  sources,
  states,
  activeSourceId,
  activeStateId,
  onSelectStory,
  onInstancesChange,
}: {
  readonly view: LabCanvasView
  readonly catalog: LabPartsCatalog | null
  readonly index: LabStoryIndex
  readonly selectedIds: readonly string[]
  readonly instances: readonly LabObjectInstance[]
  readonly sources: readonly LabSourceOption[]
  readonly states: readonly LabStateOption[]
  readonly activeSourceId: string
  readonly activeStateId: SourceStatus
  readonly onSelectStory: (storyId: string) => void
  readonly onInstancesChange: (instances: readonly LabObjectInstance[]) => void
}) {
  const { selectedDevices } = useLab()
  const selectedStories = selectedIds.map(id => index.byId.get(id)).filter((story): story is Story => Boolean(story))
  const primaryStory = selectedStories[0] ?? null
  const primaryInstance = primaryStory ? instances.find(instance => instance.storyId === primaryStory.id) ?? null : null
  if (view === "surface") return <LabSurfaceView sourceId={activeSourceId} stateId={activeStateId} />
  if (view === "gallery") return <LabGalleryView catalog={catalog} index={index} onSelect={onSelectStory} />
  if (view === "selection") {
    return <LabSelectionView story={primaryStory} byId={index.byId} instance={primaryInstance} sources={sources} states={states} onBind={(id, patch) => onInstancesChange(instances.map(instance => instance.id === id ? { ...instance, ...patch } : instance))} />
  }
  if (view === "matrix") return <LabMatrixView selectedStories={selectedStories} stories={index.byId} sources={sources} states={states} devices={selectedDevices} />
  return <LabCanvasBoard instances={instances} stories={index.byId} sources={sources} states={states} onInstancesChange={onInstancesChange} />
}
