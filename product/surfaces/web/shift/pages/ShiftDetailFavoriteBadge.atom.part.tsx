/** Detail Favorite Badge atom catalog entry. */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDetailFavoriteBadge } from "./ShiftDetailFavoriteBadge"

export default {
  designPartId: SHIFT_DESIGN_PARTS.detailFavoriteBadge.id,
  name: "Detail Favorite Badge",
  note: "Detail",
  render: () => (
    <ShiftPartFrame height={60}>
      <ShiftDetailFavoriteBadge />
    </ShiftPartFrame>
  ),
}
