import { Settings } from "lucide-react"
import type { ScreenConfig } from "../../device-lab"
import { LabScreenSelect } from "../components/LabScreenSelect"
import { LabSurfaceSelect } from "../components/LabSurfaceSelect"
import type {
  LabWorkshopCommand,
  LabWorkshopTool,
} from "../model/lab-canvas-state"
import { LabWorkspaceToolStrip } from "./LabWorkspaceToolStrip"
import { LabPresentationToggle } from "./LabPresentationToggle"
import { LabPreviewPickToggle } from "./LabPreviewPickToggle"
import { LabSyncToggle } from "./LabSyncToggle"
import type { LabPresentation } from "./lab-presentation"

/**
 * The shared workspace control cluster: surface choice, placed-part screen aspect,
 * board tools, Pick mode, layout presentation, and settings. Device and Parts
 * selection live in their panels; the canvas itself no longer has a Device/Compose
 * mode toggle.
 */
export function LabControls({
  screenChoices,
  activeScreenId,
  onScreenChange,
  tool,
  hasObjects,
  onToolChange,
  onCommand,
  onClear,
  previewPickMode,
  onPreviewPickModeChange,
  presentation,
  onPresentationChange,
  onOpenSettings,
}: {
  readonly screenChoices?: readonly ScreenConfig[]
  readonly activeScreenId?: string
  readonly onScreenChange?: (id: string) => void
  readonly tool: LabWorkshopTool
  readonly hasObjects: boolean
  readonly onToolChange: (tool: LabWorkshopTool) => void
  readonly onCommand: (command: LabWorkshopCommand) => void
  readonly onClear: () => void
  readonly previewPickMode?: boolean
  readonly onPreviewPickModeChange?: (active: boolean) => void
  readonly presentation: LabPresentation
  readonly onPresentationChange: (presentation: LabPresentation) => void
  readonly onOpenSettings: () => void
}) {
  return (
    <>
      <LabSurfaceSelect />
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
      <LabWorkspaceToolStrip
        tool={tool}
        hasObjects={hasObjects}
        onToolChange={onToolChange}
        onCommand={onCommand}
        onClear={onClear}
      />
      {onPreviewPickModeChange ? (
        <LabPreviewPickToggle
          active={Boolean(previewPickMode)}
          onChange={onPreviewPickModeChange}
        />
      ) : null}
      <span className="pt-controls-spacer" />
      <LabSyncToggle />
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
