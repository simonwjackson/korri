/**
 * Store Spotlight Hero organism catalog entry — the featured, art-forward
 * banner the Spotlight variant leads with, from the real store fixture.
 */
import { SHIFT_STORE_ENTRIES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftStoreSpotlightHero } from "./ShiftStoreSpotlightHero"
import type { ShiftStoreEntry } from "./shift-store-entry"

const entry: ShiftStoreEntry = SHIFT_STORE_ENTRIES[0] ?? {
  id: "entry",
  title: "Game",
  artUrl: "",
  sources: ["Community"],
  status: "available",
}

export default {
  designPartId: SHIFT_DESIGN_PARTS.storeSpotlightHero.id,
  name: "Store Spotlight Hero",
  note: "Store",
  render: () => (
    <ShiftPartFrame height={420}>
      <div
        data-shift-store
        className="intrinsic"
        style={{ width: "100%", height: "100%" }}
      >
        <ShiftStoreSpotlightHero entry={entry} />
      </div>
    </ShiftPartFrame>
  ),
}
