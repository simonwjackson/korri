/**
 * Shift library — the Deck hero tag line (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftDeckTags({ tags }: { readonly tags: string }) {
  return (
    <p
      className="shift-lib-deck-tags"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.deckTags)}
    >
      {tags}
    </p>
  )
}
