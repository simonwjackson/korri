/** Detail Title atom catalog entry. */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDetailTitle } from "./ShiftDetailTitle"

export default {
  designPartId: SHIFT_DESIGN_PARTS.detailTitle.id,
  name: "Detail Title",
  note: "Detail",
  render: () => (
    <ShiftPartFrame height={90}>
      <ShiftDetailTitle title="Hollow Knight" />
    </ShiftPartFrame>
  ),
}
