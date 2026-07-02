/**
 * Deck Title atom catalog entry.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDeckTitle } from "./ShiftDeckTitle"

export default {
  designPartId: SHIFT_DESIGN_PARTS.deckTitle.id,
  name: "Deck Title",
  note: "Deck",
  render: () => (
    <ShiftPartFrame height={80}>
      <ShiftDeckTitle title="Hollow Knight" />
    </ShiftPartFrame>
  ),
}
