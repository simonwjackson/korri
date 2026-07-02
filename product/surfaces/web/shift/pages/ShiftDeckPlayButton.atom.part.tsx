/**
 * Deck Play Button atom catalog entry.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDeckPlayButton } from "./ShiftDeckPlayButton"

export default {
  designPartId: SHIFT_DESIGN_PARTS.deckPlayButton.id,
  name: "Deck Play Button",
  note: "Deck",
  render: () => (
    <ShiftPartFrame height={80}>
      <ShiftDeckPlayButton onClick={() => undefined} />
    </ShiftPartFrame>
  ),
}
