/**
 * Shift game actions sheet — the contextual command menu for a single game.
 *
 * The first reuse of the shared sheet, and a command surface: focus or hover a
 * game, open this, and every action the system can take on it is here, grouped
 * (Play / Organize / Content / Settings / Danger). It is the composition root
 * for the sheet in this context — it maps a game's state + wired handlers onto
 * the sheet compounds and owns nothing but that mapping. The pure
 * `shiftGameActionsModel` decides what's enabled; this component only supplies
 * the glyph per row and lays the groups out. The host holds the open state
 * (which game is targeted) and the handlers.
 */
import {
  Boxes,
  DownloadCloud,
  ExternalLink,
  Layers,
  ListTree,
  Play,
  Plus,
  Settings,
  SlidersHorizontal,
  Square,
  Star,
  Trash2,
} from "lucide-react"
import type { ReactNode } from "react"
import { ShiftSheetAction } from "../molecules/ShiftSheetAction"
import { ShiftSheetBody } from "./ShiftSheetBody"
import { ShiftSheetGroup } from "./ShiftSheetGroup"
import { ShiftSheetHeader } from "./ShiftSheetHeader"
import { ShiftSheetPanel } from "./ShiftSheetPanel"
import { ShiftSheetRoot } from "./ShiftSheetRoot"
import { ShiftSheetTitle } from "./ShiftSheetTitle"
import {
  type ShiftGameActionsHandlers,
  type ShiftGameActionsState,
  shiftGameActionsModel,
} from "./shift-game-actions-model"

/** Glyph per action id. Icons live in the view, never in the pure model. */
const ACTION_ICONS: Record<string, ReactNode> = {
  play: <Play />,
  "new-game": <Play />,
  "play-with": <Layers />,
  stream: <ExternalLink />,
  stop: <Square />,
  favorite: <Star />,
  "add-to-collection": <Plus />,
  "open-details": <ListTree />,
  reacquire: <DownloadCloud />,
  "view-in-source": <ExternalLink />,
  "manage-releases": <Boxes />,
  "game-settings": <Settings />,
  "default-runtime": <SlidersHorizontal />,
  remove: <Trash2 />,
}

const noop = () => {}

export interface ShiftGameActionsSheetProps {
  readonly open: boolean
  readonly gameTitle: string
  readonly state: ShiftGameActionsState
  readonly handlers: ShiftGameActionsHandlers
  readonly onClose: () => void
}

export function ShiftGameActionsSheet({
  open,
  gameTitle,
  state,
  handlers,
  onClose,
}: ShiftGameActionsSheetProps) {
  const groups = shiftGameActionsModel({ state, handlers })

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
          {groups.map(group => (
            <ShiftSheetGroup key={group.id} title={group.title}>
              {group.actions.map(action => (
                <ShiftSheetAction
                  key={action.id}
                  label={action.label}
                  disabled={!action.enabled}
                  onSelect={action.onSelect ?? noop}
                  {...(ACTION_ICONS[action.id]
                    ? { icon: ACTION_ICONS[action.id] }
                    : {})}
                  {...(action.tone ? { tone: action.tone } : {})}
                />
              ))}
            </ShiftSheetGroup>
          ))}
        </ShiftSheetBody>
      </ShiftSheetPanel>
    </ShiftSheetRoot>
  )
}
