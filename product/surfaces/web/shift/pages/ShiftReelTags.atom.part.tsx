/**
 * Reel Tags atom catalog entry.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftReelTags } from "./ShiftReelTags"

export default {
  designPartId: SHIFT_DESIGN_PARTS.reelTags.id,
  name: "Reel Tags",
  note: "Reel",
  render: () => (
    <ShiftPartFrame height={60}>
      <ShiftReelTags genre="Metroidvania" />
    </ShiftPartFrame>
  ),
}
