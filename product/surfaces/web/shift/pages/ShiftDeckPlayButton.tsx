/**
 * Shift library — the Deck "Play" button (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftDeckPlayButton({
  onClick,
}: {
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      className="shift-lib-deck-play"
      onClick={onClick}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.deckPlayButton)}
    >
      ▶ Play
    </button>
  )
}
