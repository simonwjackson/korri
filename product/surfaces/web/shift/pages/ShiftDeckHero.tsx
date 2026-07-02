/**
 * Shift library — the Deck hero caption (molecule).
 *
 * The current game's title and its genre · developer tag line, shown over the
 * bleed beneath the card.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

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
      <h1 className="shift-lib-deck-title">{title}</h1>
      {tags ? <p className="shift-lib-deck-tags">{tags}</p> : null}
    </div>
  )
}
