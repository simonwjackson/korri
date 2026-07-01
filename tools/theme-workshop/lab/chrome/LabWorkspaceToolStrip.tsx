import {
  Grid3X3,
  Hand,
  type LucideIcon,
  MousePointer2,
  RotateCcw,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import type {
  LabWorkshopCommand,
  LabWorkshopTool,
} from "../model/lab-canvas-state"

const TOOLS: readonly {
  readonly id: LabWorkshopTool
  readonly Icon: LucideIcon
  readonly label: string
}[] = [
  { id: "select", Icon: MousePointer2, label: "Select / move cards" },
  { id: "hand", Icon: Hand, label: "Hand tool / pan" },
]

const COMMANDS: readonly {
  readonly id: LabWorkshopCommand
  readonly Icon: LucideIcon
  readonly label: string
}[] = [
  { id: "zoom-out", Icon: ZoomOut, label: "Zoom out" },
  { id: "zoom-in", Icon: ZoomIn, label: "Zoom in" },
  { id: "reset-view", Icon: RotateCcw, label: "Reset view to 100%" },
  { id: "tidy", Icon: Grid3X3, label: "Tidy cards" },
]

/**
 * Compose canvas tools (select/pan + zoom/reset/tidy/clear), rendered inline in
 * the control overlay. The whole lab chrome lives in one overlay, so the tools
 * sit alongside the panels rather than in a separate floating rail.
 */
export function LabWorkspaceToolStrip({
  tool,
  hasObjects,
  onToolChange,
  onCommand,
  onClear,
}: {
  readonly tool: LabWorkshopTool
  readonly hasObjects: boolean
  readonly onToolChange: (tool: LabWorkshopTool) => void
  readonly onCommand: (command: LabWorkshopCommand) => void
  readonly onClear: () => void
}) {
  return (
    <div className="pt-overlay-tools" role="toolbar" aria-label="Workspace tools">
      {TOOLS.map(candidate => (
        <button
          key={candidate.id}
          type="button"
          aria-label={candidate.label}
          aria-pressed={tool === candidate.id}
          className={`pt-tool${tool === candidate.id ? " is-on" : ""}`}
          onClick={() => onToolChange(candidate.id)}
        >
          <candidate.Icon aria-hidden size={17} strokeWidth={2.1} />
        </button>
      ))}
      <span className="pt-tool-divider" aria-hidden />
      {COMMANDS.map(command => (
        <button
          key={command.id}
          type="button"
          aria-label={command.label}
          className="pt-tool"
          onClick={() => onCommand(command.id)}
        >
          <command.Icon aria-hidden size={17} strokeWidth={2.1} />
        </button>
      ))}
      <button
        type="button"
        aria-label="Clear placed parts"
        className="pt-tool"
        disabled={!hasObjects}
        onClick={onClear}
      >
        <Trash2 aria-hidden size={17} strokeWidth={2.1} />
      </button>
    </div>
  )
}
