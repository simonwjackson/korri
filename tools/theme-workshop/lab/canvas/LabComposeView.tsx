import type {
  LabObjectInstance,
  LabWorkshopCommandSignal,
  LabWorkshopTool,
} from "../model/lab-canvas-state"
import type { LabStoryIndex } from "../model/lab-part-model"
import type { LabSourceOption } from "../model/lab-source-state"
import type { LabPartsCatalog } from "../parts-discovery"
import { LabGalleryView } from "./LabGalleryView"
import { LabWorkshopBoard } from "./LabWorkshopBoard"

/**
 * Compose frame: one logical screen-design surface.
 *
 * This collapses the old Gallery + Workshop split. The gallery is now the
 * palette inside Compose; picking a part places it on the same board where the
 * real page renderer runs through real edge data. Device/Preview owns physical
 * multi-screen validation; Compose is device-agnostic screen design.
 */
export function LabComposeView({
  catalog,
  index,
  selectedIds,
  instances,
  sources,
  tool,
  command,
  screenId,
  onSelectStory,
  onInstancesChange,
}: {
  readonly catalog: LabPartsCatalog | null
  readonly index: LabStoryIndex
  readonly selectedIds: readonly string[]
  readonly instances: readonly LabObjectInstance[]
  readonly sources: readonly LabSourceOption[]
  readonly tool: LabWorkshopTool
  readonly command: LabWorkshopCommandSignal | null
  /** Which logical screen aspect to render for multi-screen devices. */
  readonly screenId: string | null
  readonly onSelectStory: (storyId: string) => void
  readonly onInstancesChange: (instances: readonly LabObjectInstance[]) => void
}) {
  return (
    <div className="lab-compose-frame" data-lab-frame="compose">
      <aside className="lab-compose-palette" aria-label="Parts palette">
        <LabGalleryView
          catalog={catalog}
          index={index}
          selectedIds={selectedIds}
          onSelect={onSelectStory}
        />
      </aside>
      <section className="lab-compose-board" aria-label="Compose board">
        <LabWorkshopBoard
          instances={instances}
          stories={index.byId}
          sources={sources}
          tool={tool}
          command={command}
          screenId={screenId}
          onInstancesChange={onInstancesChange}
        />
      </section>
    </div>
  )
}
