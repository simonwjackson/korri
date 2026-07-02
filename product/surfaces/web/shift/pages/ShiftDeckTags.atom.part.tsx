/**
 * Deck Tags atom catalog entry.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDeckTags } from "./ShiftDeckTags"

export default {
  designPartId: SHIFT_DESIGN_PARTS.deckTags.id,
  name: "Deck Tags",
  note: "Deck",
  render: () => (
    <ShiftPartFrame height={60}>
      <ShiftDeckTags tags="Metroidvania · Team Cherry" />
    </ShiftPartFrame>
  ),
}
