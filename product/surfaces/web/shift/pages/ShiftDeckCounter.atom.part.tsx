/**
 * Deck Counter atom catalog entry — the "n / total" position badge.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDeckCounter } from "./ShiftDeckCounter"

export default {
  designPartId: SHIFT_DESIGN_PARTS.deckCounter.id,
  name: "Deck Counter",
  note: "Deck",
  render: () => (
    <ShiftPartFrame height={80}>
      <ShiftDeckCounter position={3} total={12} />
    </ShiftPartFrame>
  ),
}
