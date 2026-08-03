/**
 * Shift game actions sheet — the contextual command menu for a single game.
 *
 * The first reuse of the shared sheet, and a command surface: focus a game,
 * open this, and everything the system can currently do to it is here. The host
 * decides which actions exist and whether each applies; Shift only supplies a
 * glyph per row and lays them out. Actions the host does not report are simply
 * absent — the sheet never advertises capabilities Korri does not have.
 */
import type { SurfaceAction } from "@contracts/surface/korri-surface"
import {
  ExternalLink,
  type LucideIcon,
  Play,
  Settings,
  Square,
  Trash2,
} from "lucide-react"
import { ShiftSheetAction } from "../molecules/ShiftSheetAction"
import { ShiftSheetBody } from "./ShiftSheetBody"
import { ShiftSheetGroup } from "./ShiftSheetGroup"
import { ShiftSheetHeader } from "./ShiftSheetHeader"
import { ShiftSheetPanel } from "./ShiftSheetPanel"
import { ShiftSheetRoot } from "./ShiftSheetRoot"
import { ShiftSheetTitle } from "./ShiftSheetTitle"

/** Glyph per action id. Icons live in the view, never in the host's model. */
const ACTION_ICONS: Record<string, LucideIcon> = {
  play: Play,
  continue: Play,
  stream: ExternalLink,
  stop: Square,
  remove: Trash2,
}

export interface ShiftGameActionsSheetProps {
  readonly open: boolean
  readonly gameTitle: string
  readonly actions: readonly SurfaceAction[]
  readonly onSelect: (actionId: string) => void
  readonly onClose: () => void
}

export function ShiftGameActionsSheet({
  open,
  gameTitle,
  actions,
  onSelect,
  onClose,
}: ShiftGameActionsSheetProps) {
  return (
    <ShiftSheetRoot
      open={open}
      onClose={onClose}
      label={`Actions for ${gameTitle}`}
    >
      <ShiftSheetPanel>
        <ShiftSheetHeader>
          <ShiftSheetTitle>{gameTitle}</ShiftSheetTitle>
        </ShiftSheetHeader>
        <ShiftSheetBody>
          <ShiftSheetGroup title="Play">
            {actions.map(action => {
              const Icon = ACTION_ICONS[action.id]
              return (
                <ShiftSheetAction
                  key={action.id}
                  label={action.label}
                  disabled={!action.enabled}
                  onSelect={() => onSelect(action.id)}
                  {...(Icon ? { icon: <Icon /> } : {})}
                  {...(action.destructive ? { tone: "danger" as const } : {})}
                />
              )
            })}
          </ShiftSheetGroup>
        </ShiftSheetBody>
      </ShiftSheetPanel>
    </ShiftSheetRoot>
  )
}
