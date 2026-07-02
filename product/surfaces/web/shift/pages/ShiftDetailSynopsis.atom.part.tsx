/** Detail Synopsis atom catalog entry. */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDetailSynopsis } from "./ShiftDetailSynopsis"

export default {
  designPartId: SHIFT_DESIGN_PARTS.detailSynopsis.id,
  name: "Detail Synopsis",
  note: "Detail",
  render: () => (
    <ShiftPartFrame height={160}>
      <ShiftDetailSynopsis>
        Descend into a vast ruined kingdom of insects and heroes. Explore
        twisting caverns, battle tainted creatures, and befriend bizarre bugs.
      </ShiftDetailSynopsis>
    </ShiftPartFrame>
  ),
}
