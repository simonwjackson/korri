/**
 * Detail Art atom catalog entry — the key-art panel.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDetailArt } from "./ShiftDetailArt"
import { SHIFT_DETAIL_PLAYED } from "./shift-detail-fixtures"

export default {
  designPartId: SHIFT_DESIGN_PARTS.detailArt.id,
  name: "Detail Art",
  note: "Detail",
  render: () => (
    <ShiftPartFrame height={420}>
      <ShiftDetailArt artUrl={SHIFT_DETAIL_PLAYED.artUrl} />
    </ShiftPartFrame>
  ),
}
