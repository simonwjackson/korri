/**
 * Shift game detail — action buttons (shared atom).
 *
 * Play/Continue (primary) + New Game (only once played) + Favorite. Shared by
 * every detail rebalance so the action set and wording stay identical across
 * layouts; the layouts only choose where to place it.
 */

import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftDetailButton } from "./ShiftDetailButton"
import { shiftDetailPlayLabel } from "./shift-detail-copy"
import type { ShiftGameDetailView } from "./shift-game-detail-view"

export interface ShiftDetailActionsProps {
  readonly game: ShiftGameDetailView
  readonly onPlay?: (id: string) => void
  readonly onFavorite?: (id: string) => void
}

export function ShiftDetailActions({
  game,
  onPlay,
  onFavorite,
}: ShiftDetailActionsProps) {
  const played = Boolean(game.lastPlayedLabel)

  return (
    <div
      className="shift-detail-actions"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailActions)}
    >
      <ShiftDetailButton
        primary
        label={`▶ ${shiftDetailPlayLabel(game)}`}
        onClick={() => onPlay?.(game.id)}
      />
      {played ? <ShiftDetailButton label="New Game" /> : null}
      <ShiftDetailButton
        pressed={game.favorite === true}
        label={game.favorite ? "★ Favorited" : "☆ Favorite"}
        onClick={() => onFavorite?.(game.id)}
      />
    </div>
  )
}
