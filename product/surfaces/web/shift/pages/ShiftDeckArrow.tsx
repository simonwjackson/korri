/**
 * Shift library — a Deck riffle arrow (atom).
 *
 * The previous/next chevron on the Deck action bar; the glyph and label are
 * supplied so one atom covers both directions.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftDeckArrowProps {
  readonly glyph: string
  readonly label: string
  readonly onClick: () => void
}

export function ShiftDeckArrow({ glyph, label, onClick }: ShiftDeckArrowProps) {
  return (
    <button
      type="button"
      className="shift-lib-deck-arrow"
      aria-label={label}
      onClick={onClick}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.deckArrow)}
    >
      {glyph}
    </button>
  )
}
