/**
 * Store Search Trigger atom catalog entry — the summon-search affordance the
 * browse-first variants show in place of a standing search bar.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftStoreSearchTrigger } from "./ShiftStoreSearchTrigger"

export default {
  designPartId: SHIFT_DESIGN_PARTS.storeSearchTrigger.id,
  name: "Store Search Trigger",
  note: "Store",
  render: () => (
    <ShiftPartFrame height={90}>
      <div data-shift-store className="intrinsic">
        <ShiftStoreSearchTrigger />
      </div>
    </ShiftPartFrame>
  ),
}
