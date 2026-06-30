import type { Dispatch, SetStateAction } from "react"
import type {
  LabObjectInstance,
  LabWorkshopCommandSignal,
  LabWorkshopTool,
} from "../model/lab-canvas-state"
import type { LabStoryIndex } from "../model/lab-part-model"
import { LabWorkshopBoard } from "./LabWorkshopBoard"

/**
 * Compose frame: one logical screen-design surface — just the board.
 *
 * Parts are picked from the single visual Parts panel in the chrome (which
 * reflows into the dock, float, or overlay); placing one drops it on this board
 * where the real page renderer runs through real edge data. Device/Preview owns
 * physical multi-screen validation; Compose is device-agnostic screen design.
 */
export function LabComposeView({
  index,
  instances,
  tool,
  command,
  screenId,
  selectedObjectId,
  onSelectObject,
  onInstancesChange,
}: {
  readonly index: LabStoryIndex
  readonly instances: readonly LabObjectInstance[]
  readonly tool: LabWorkshopTool
  readonly command: LabWorkshopCommandSignal | null
  /** Which logical screen aspect to render for multi-screen devices. */
  readonly screenId: string | null
  readonly selectedObjectId: string | null
  readonly onSelectObject: (id: string | null) => void
  readonly onInstancesChange: Dispatch<
    SetStateAction<readonly LabObjectInstance[]>
  >
}) {
  return (
    <div className="lab-compose-frame" data-lab-frame="compose">
      <section className="lab-compose-board" aria-label="Compose board">
        <LabWorkshopBoard
          instances={instances}
          stories={index.byId}
          tool={tool}
          command={command}
          screenId={screenId}
          selectedId={selectedObjectId}
          onSelect={onSelectObject}
          onInstancesChange={onInstancesChange}
        />
      </section>
    </div>
  )
}
