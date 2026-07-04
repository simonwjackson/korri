/**
 * Store Index Row molecule catalog entry — the full-width selectable list row
 * with its quiet trailing "view" chevron, from the real store fixture.
 */
import { SHIFT_STORE_ENTRIES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftStoreIndexRow } from "./ShiftStoreIndexRow"
import type { ShiftStoreEntry } from "./shift-store-entry"

const entry: ShiftStoreEntry = SHIFT_STORE_ENTRIES[0] ?? {
  id: "entry",
  title: "Game",
  artUrl: "",
  sources: ["Community"],
  status: "available",
}

export default {
  designPartId: SHIFT_DESIGN_PARTS.storeIndexRow.id,
  name: "Store Index Row",
  note: "Store",
  render: () => (
    <ShiftPartFrame width={520} height={120}>
      <div data-shift-store className="intrinsic" style={{ width: "100%" }}>
        <ShiftStoreIndexRow entry={entry} />
      </div>
    </ShiftPartFrame>
  ),
}
