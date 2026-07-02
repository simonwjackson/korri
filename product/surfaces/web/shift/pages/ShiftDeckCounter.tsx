/**
 * Shift library — the Deck position counter (atom).
 *
 * The "3 / 12" badge showing where in the stack the current card sits.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftDeckCounterProps {
  /** 1-based position of the current card. */
  readonly position: number
  readonly total: number
}

export function ShiftDeckCounter({ position, total }: ShiftDeckCounterProps) {
  return (
    <span
      className="shift-lib-deck-counter"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.deckCounter)}
    >
      {position} / {total}
    </span>
  )
}
