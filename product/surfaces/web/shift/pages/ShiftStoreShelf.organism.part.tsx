/**
 * Store Shelf organism catalog entry — one titled, scrollable source band of
 * browse tiles, from the real store fixture.
 */
import { SHIFT_STORE_ENTRIES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftStoreShelf } from "./ShiftStoreShelf"

const entries = SHIFT_STORE_ENTRIES.slice(0, 6)

export default {
  designPartId: SHIFT_DESIGN_PARTS.storeShelf.id,
  name: "Store Shelf",
  note: "Store",
  render: () => (
    <ShiftPartFrame height={420}>
      <div data-shift-store className="intrinsic" style={{ width: "100%" }}>
        <ShiftStoreShelf title="Community" entries={entries} />
      </div>
    </ShiftPartFrame>
  ),
}
