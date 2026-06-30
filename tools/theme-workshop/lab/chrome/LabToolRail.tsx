import type { LucideIcon } from "lucide-react"
import {
  Grid3X3,
  Hand,
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

const ICON_SIZE = 17
const ICON_STROKE = 2.1

const TOOLS: readonly {
  readonly id: LabWorkshopTool
  readonly Icon: LucideIcon
  readonly label: string
}[] = [
  { id: "select", Icon: MousePointer2, label: "Select / move cards" },
  { id: "hand", Icon: Hand, label: "Hand tool / pan" },
]

const COMMANDS: readonly {
  readonly id: LabWorkshopCommand | "clear"
  readonly Icon: LucideIcon
  readonly label: string
}[] = [
  { id: "zoom-out", Icon: ZoomOut, label: "Zoom out" },
  { id: "zoom-in", Icon: ZoomIn, label: "Zoom in" },
  { id: "reset-view", Icon: RotateCcw, label: "Reset view to 100%" },
  { id: "tidy", Icon: Grid3X3, label: "Tidy cards" },
  { id: "clear", Icon: Trash2, label: "Clear workshop" },
]

function ToolIcon({ Icon }: { readonly Icon: LucideIcon }) {
  return <Icon aria-hidden size={ICON_SIZE} strokeWidth={ICON_STROKE} />
}

export function LabToolRail({
  docked,
  tool,
  hasObjects,
  onToolChange,
  onCommand,
  onClear,
}: {
  readonly docked: boolean
  readonly tool: LabWorkshopTool
  readonly hasObjects: boolean
  readonly onToolChange: (tool: LabWorkshopTool) => void
  readonly onCommand: (command: LabWorkshopCommand) => void
  readonly onClear: () => void
}) {
  return (
    <div
      className={`pt-toolrail${docked ? " is-docked" : ""}`}
      role="toolbar"
      aria-label="Workshop tools"
    >
      {TOOLS.map(candidate => (
        <button
          key={candidate.id}
          type="button"
          aria-label={candidate.label}
          aria-pressed={tool === candidate.id}
          className={`pt-tool${tool === candidate.id ? " is-on" : ""}`}
          onClick={() => onToolChange(candidate.id)}
        >
          <ToolIcon Icon={candidate.Icon} />
        </button>
      ))}
      <span className="pt-tool-sep" aria-hidden />
      {COMMANDS.map(command => (
        <button
          key={command.id}
          type="button"
          aria-label={command.label}
          className="pt-tool"
          disabled={command.id === "clear" && !hasObjects}
          onClick={() =>
            command.id === "clear" ? onClear() : onCommand(command.id)
          }
        >
          <ToolIcon Icon={command.Icon} />
        </button>
      ))}
    </div>
  )
}
