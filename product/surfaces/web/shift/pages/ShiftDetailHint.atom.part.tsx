/** Detail Hint atom catalog entry. */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDetailHint } from "./ShiftDetailHint"

export default {
  designPartId: SHIFT_DESIGN_PARTS.detailHint.id,
  name: "Detail Hint",
  note: "Detail",
  render: () => (
    <ShiftPartFrame height={70}>
      <ShiftDetailHint glyph="A" label="Continue" />
    </ShiftPartFrame>
  ),
}
