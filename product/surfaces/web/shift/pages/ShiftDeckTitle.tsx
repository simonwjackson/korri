/**
 * Shift library — the Deck hero title (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftDeckTitle({ title }: { readonly title: string }) {
  return (
    <h1
      className="shift-lib-deck-title"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.deckTitle)}
    >
      {title}
    </h1>
  )
}
