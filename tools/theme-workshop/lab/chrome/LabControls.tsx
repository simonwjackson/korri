import { Settings } from "lucide-react"
import type { ScreenConfig } from "../../device-lab"
import { LabScreenSelect } from "../components/LabScreenSelect"
import type {
  LabCanvasView,
  LabWorkshopCommand,
  LabWorkshopTool,
} from "../model/lab-canvas-state"
import { LabComposeToolStrip } from "./LabComposeToolStrip"
import { LabPresentationToggle } from "./LabPresentationToggle"
import { LabViewToggle } from "./LabViewToggle"
import type { LabChromeView } from "./lab-chrome-types"
import type { LabPresentation } from "./lab-presentation"

/**
 * The shared control cluster: screen select, the view toggle, Compose tools,
 * the layout (presentation) toggle, and settings. Device/Surface selection now
 * lives in the Device panel. Returned as a fragment so each chrome position
 * (top bar or overlay head) lays out the very same controls — they reflow
 * rather than being rebuilt per position.
 */
export function LabControls({
  views,
  view,
  onViewChange,
  screenChoices,
  activeScreenId,
  onScreenChange,
  tool,
  hasObjects,
  onToolChange,
  onCommand,
  onClear,
  presentation,
  onPresentationChange,
  onOpenSettings,
}: {
  readonly views: readonly LabChromeView[]
  readonly view: LabCanvasView
  readonly onViewChange: (id: LabCanvasView) => void
  readonly screenChoices?: readonly ScreenConfig[]
  readonly activeScreenId?: string
  readonly onScreenChange?: (id: string) => void
  readonly tool: LabWorkshopTool
  readonly hasObjects: boolean
  readonly onToolChange: (tool: LabWorkshopTool) => void
  readonly onCommand: (command: LabWorkshopCommand) => void
  readonly onClear: () => void
  readonly presentation: LabPresentation
  readonly onPresentationChange: (presentation: LabPresentation) => void
  readonly onOpenSettings: () => void
}) {
  return (
    <>
      <LabViewToggle views={views} view={view} onChange={onViewChange} />
      {screenChoices &&
      screenChoices.length > 1 &&
      activeScreenId &&
      onScreenChange ? (
        <LabScreenSelect
          screens={screenChoices}
          activeId={activeScreenId}
          onChange={onScreenChange}
        />
      ) : null}
      {view === "compose" ? (
        <LabComposeToolStrip
          tool={tool}
          hasObjects={hasObjects}
          onToolChange={onToolChange}
          onCommand={onCommand}
          onClear={onClear}
        />
      ) : null}
      <span className="pt-controls-spacer" />
      <LabPresentationToggle
        presentation={presentation}
        onChange={onPresentationChange}
      />
      <button
        type="button"
        className="pt-ctl-icon"
        aria-label="Settings"
        onClick={onOpenSettings}
      >
        <Settings size={16} aria-hidden />
      </button>
    </>
  )
}
