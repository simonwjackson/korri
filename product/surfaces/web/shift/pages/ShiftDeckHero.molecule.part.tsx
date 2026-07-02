/**
 * Deck Hero molecule catalog entry — title + tag line.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDeckHero } from "./ShiftDeckHero"

export default {
  designPartId: SHIFT_DESIGN_PARTS.deckHero.id,
  name: "Deck Hero",
  note: "Deck",
  render: () => (
    <ShiftPartFrame height={120}>
      <ShiftDeckHero title="Hollow Knight" tags="Metroidvania · Team Cherry" />
    </ShiftPartFrame>
  ),
}
