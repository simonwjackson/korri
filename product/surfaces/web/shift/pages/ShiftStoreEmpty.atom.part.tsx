/**
 * Store Empty atom catalog entry — the no-results message a search falls back
 * to when nothing matches.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftStoreEmpty } from "./ShiftStoreEmpty"

export default {
  designPartId: SHIFT_DESIGN_PARTS.storeEmpty.id,
  name: "Store Empty",
  note: "Store",
  render: () => (
    <ShiftPartFrame height={120}>
      <div data-shift-store className="intrinsic">
        <ShiftStoreEmpty />
      </div>
    </ShiftPartFrame>
  ),
}
