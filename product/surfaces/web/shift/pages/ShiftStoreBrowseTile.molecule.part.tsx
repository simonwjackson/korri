/**
 * Store Browse Tile molecule catalog entry — the selectable cover tile the
 * Browse and Shelves variants render, from the real store fixture. The tile is
 * the action (it opens detail), so there is no per-item button here.
 */
import { SHIFT_STORE_ENTRIES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftStoreBrowseTile } from "./ShiftStoreBrowseTile"
import type { ShiftStoreEntry } from "./shift-store-entry"

const entry: ShiftStoreEntry = SHIFT_STORE_ENTRIES[0] ?? {
  id: "entry",
  title: "Game",
  artUrl: "",
  sources: ["Community"],
  status: "available",
}

export default {
  designPartId: SHIFT_DESIGN_PARTS.storeBrowseTile.id,
  name: "Store Browse Tile",
  note: "Store",
  render: () => (
    <ShiftPartFrame width={220} height={360}>
      <div data-shift-store className="intrinsic">
        <ShiftStoreBrowseTile entry={entry} />
      </div>
    </ShiftPartFrame>
  ),
}
