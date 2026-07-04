/**
 * Store Finder molecule catalog entry — the compact search + filter pill, from
 * the real store fixture. Both segments start collapsed to glyphs; open the
 * filter in the lab to see the chips expand horizontally beside the pill.
 */
import { SHIFT_STORE_ENTRIES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftStoreFinder } from "./ShiftStoreFinder"
import { deriveShiftStoreSources } from "./shift-store-query"

const facets = deriveShiftStoreSources(SHIFT_STORE_ENTRIES)

export default {
  designPartId: SHIFT_DESIGN_PARTS.storeFinder.id,
  name: "Store Finder",
  note: "Store",
  render: () => (
    <ShiftPartFrame height={220}>
      <div data-shift-store className="intrinsic">
        <ShiftStoreFinder
          text=""
          onText={() => undefined}
          facets={facets}
          selected={["itch.io"]}
          onToggleSource={() => undefined}
        />
      </div>
    </ShiftPartFrame>
  ),
}
