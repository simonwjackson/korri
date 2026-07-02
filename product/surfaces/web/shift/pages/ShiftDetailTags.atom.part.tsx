/** Detail Tags atom catalog entry. */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDetailTags } from "./ShiftDetailTags"

export default {
  designPartId: SHIFT_DESIGN_PARTS.detailTags.id,
  name: "Detail Tags",
  note: "Detail",
  render: () => (
    <ShiftPartFrame height={60}>
      <ShiftDetailTags tags="Metroidvania · Team Cherry" />
    </ShiftPartFrame>
  ),
}
