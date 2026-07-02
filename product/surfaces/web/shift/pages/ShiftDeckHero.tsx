/**
 * Shift library — the Deck hero caption (molecule).
 *
 * The current game's title and its genre · developer tag line, shown over the
 * bleed beneath the card.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftDeckTags } from "./ShiftDeckTags"
import { ShiftDeckTitle } from "./ShiftDeckTitle"

export interface ShiftDeckHeroProps {
  readonly title: string
  readonly tags?: string
}

export function ShiftDeckHero({ title, tags }: ShiftDeckHeroProps) {
  return (
    <div
      className="shift-lib-deck-hero"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.deckHero)}
    >
      <ShiftDeckTitle title={title} />
      {tags ? <ShiftDeckTags tags={tags} /> : null}
    </div>
  )
}
