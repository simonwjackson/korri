/**
 * Reel Title atom catalog entry.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftReelTitle } from "./ShiftReelTitle"

export default {
  designPartId: SHIFT_DESIGN_PARTS.reelTitle.id,
  name: "Reel Title",
  note: "Reel",
  render: () => (
    <ShiftPartFrame height={80}>
      <ShiftReelTitle title="Hollow Knight" />
    </ShiftPartFrame>
  ),
}
