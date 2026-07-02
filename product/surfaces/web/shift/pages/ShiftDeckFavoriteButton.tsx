/**
 * Shift library — the Deck favourite toggle (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftDeckFavoriteButtonProps {
  readonly favored: boolean
  readonly onClick: () => void
}

export function ShiftDeckFavoriteButton({
  favored,
  onClick,
}: ShiftDeckFavoriteButtonProps) {
  return (
    <button
      type="button"
      className="shift-lib-deck-fav"
      aria-pressed={favored}
      onClick={onClick}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.deckFavoriteButton)}
    >
      {favored ? "★" : "☆"} Favorite
    </button>
  )
}
