/**
 * Shift library — the Deck action cluster (molecule).
 *
 * The on-screen counterpart to the flick gestures: previous / Play / Favorite
 * toggle / next.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftDeckArrow } from "./ShiftDeckArrow"
import { ShiftDeckFavoriteButton } from "./ShiftDeckFavoriteButton"
import { ShiftDeckPlayButton } from "./ShiftDeckPlayButton"

export interface ShiftDeckActionsProps {
  readonly favored: boolean
  readonly onPrev: () => void
  readonly onNext: () => void
  readonly onPlay: () => void
  readonly onToggleFavorite: () => void
}

export function ShiftDeckActions({
  favored,
  onPrev,
  onNext,
  onPlay,
  onToggleFavorite,
}: ShiftDeckActionsProps) {
  return (
    <div
      className="shift-lib-deck-actions"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.deckActions)}
    >
      <ShiftDeckArrow glyph="‹" label="Previous game" onClick={onPrev} />
      <ShiftDeckPlayButton onClick={onPlay} />
      <ShiftDeckFavoriteButton favored={favored} onClick={onToggleFavorite} />
      <ShiftDeckArrow glyph="›" label="Next game" onClick={onNext} />
    </div>
  )
}
