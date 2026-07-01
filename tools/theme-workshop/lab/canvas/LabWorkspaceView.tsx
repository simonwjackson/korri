import type { Dispatch, SetStateAction } from "react"
import type {
  LabWorkshopCommandSignal,
  LabWorkshopTool,
} from "../model/lab-canvas-state"
import type { LabStoryIndex } from "../model/lab-part-model"
import type { LabPreviewSelection } from "../model/lab-preview-selection"
import { LabWorkshopBoard } from "./LabWorkshopBoard"

/**
 * Workspace board frame: live device objects and placed part objects share one
 * canvas.
 *
 * Parts are picked from the single visual Parts panel in the chrome (which
 * reflows into the dock, float, or overlay); placing one drops it on this board
 * where the real page/part renderer runs through real edge data. Live device
 * objects own physical multi-screen validation; placed part objects are
 * device-agnostic screen design.
 */
export function LabWorkspaceView({
  index,
  objects,
  tool,
  command,
  screenId,
  selectedObjectId,
  pickMode,
  innerSelection,
  onSelectObject,
  onInnerSelect,
  sourceId,
  stateId,
  onObjectsChange,
  onDeleteTake,
  onPromoteTake,
  onGenerateTakes,
}: {
  readonly index: LabStoryIndex
  readonly objects: readonly import("../model/lab-canvas-object").LabCanvasObject[]
  readonly tool: LabWorkshopTool
  readonly command: LabWorkshopCommandSignal | null
  /** Which logical screen aspect to render for multi-screen devices. */
  readonly screenId: string | null
  readonly selectedObjectId: string | null
  readonly pickMode: boolean
  readonly innerSelection: LabPreviewSelection | null
  readonly onSelectObject: (id: string | null) => void
  readonly onInnerSelect: (selection: LabPreviewSelection | null) => void
  readonly sourceId: string
  readonly stateId: import("../model/lab-source-state").LabInputValue
  readonly onObjectsChange: Dispatch<
    SetStateAction<
      readonly import("../model/lab-canvas-object").LabCanvasObject[]
    >
  >
  readonly onDeleteTake: (storyId: string) => void
  readonly onPromoteTake: (storyId: string) => void
  readonly onGenerateTakes: (
    id: string,
    request: { readonly prompt: string; readonly count: number },
  ) => void
}) {
  return (
    <div
      className="lab-compose-frame lab-workspace-frame"
      data-lab-frame="workspace"
    >
      <section className="lab-compose-board" aria-label="Workspace board">
        <LabWorkshopBoard
          objects={objects}
          stories={index.byId}
          designPassMetaById={index.designPassMetaById}
          tool={tool}
          command={command}
          screenId={screenId}
          selectedId={selectedObjectId}
          pickMode={pickMode}
          innerSelection={innerSelection}
          onSelect={onSelectObject}
          onInnerSelect={onInnerSelect}
          sourceId={sourceId}
          stateId={stateId}
          onObjectsChange={onObjectsChange}
          onDeleteTake={onDeleteTake}
          onPromoteTake={onPromoteTake}
          onGenerateTakes={onGenerateTakes}
        />
      </section>
    </div>
  )
}
