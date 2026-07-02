/**
 * Reel Spin Button atom catalog entry.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftReelSpinButton } from "./ShiftReelSpinButton"

export default {
  designPartId: SHIFT_DESIGN_PARTS.reelSpinButton.id,
  name: "Reel Spin Button",
  note: "Reel",
  render: () => (
    <ShiftPartFrame height={80}>
      <ShiftReelSpinButton onClick={() => undefined} />
    </ShiftPartFrame>
  ),
}
