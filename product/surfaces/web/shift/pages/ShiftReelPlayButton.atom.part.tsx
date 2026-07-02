/**
 * Reel Play Button atom catalog entry.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftReelPlayButton } from "./ShiftReelPlayButton"

export default {
  designPartId: SHIFT_DESIGN_PARTS.reelPlayButton.id,
  name: "Reel Play Button",
  note: "Reel",
  render: () => (
    <ShiftPartFrame height={80}>
      <ShiftReelPlayButton onClick={() => undefined} />
    </ShiftPartFrame>
  ),
}
