/**
 * Shift library — the Deck action cluster (molecule).
 *
 * The on-screen counterpart to the flick gestures: previous / Play / Favorite
 * toggle / next.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

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
      <button
        type="button"
        className="shift-lib-deck-arrow"
        aria-label="Previous game"
        onClick={onPrev}
      >
        ‹
      </button>
      <button type="button" className="shift-lib-deck-play" onClick={onPlay}>
        ▶ Play
      </button>
      <button
        type="button"
        className="shift-lib-deck-fav"
        aria-pressed={favored}
        onClick={onToggleFavorite}
      >
        {favored ? "★" : "☆"} Favorite
      </button>
      <button
        type="button"
        className="shift-lib-deck-arrow"
        aria-label="Next game"
        onClick={onNext}
      >
        ›
      </button>
    </div>
  )
}
