/**
 * Deck Arrow atom catalog entry — previous and next riffle chevrons.
 */
import type { Story } from "@simonwjackson/caliper"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDeckArrow } from "./ShiftDeckArrow"

export const ShiftDeckArrowStates = [
  { state: "Previous", glyph: "‹", label: "Previous game" },
  { state: "Next", glyph: "›", label: "Next game" },
].map(({ state, glyph, label }) => ({
  id: `shift-deck-arrow-${state.toLowerCase()}`,
  designPartId: SHIFT_DESIGN_PARTS.deckArrow.id,
  layer: "atom" as const,
  name: "Deck Arrow",
  note: "Arrow states",
  state,
  render: () => (
    <ShiftPartFrame height={80}>
      <ShiftDeckArrow glyph={glyph} label={label} onClick={() => undefined} />
    </ShiftPartFrame>
  ),
})) satisfies readonly Story[]
