/**
 * Store Panel organism catalog entry — the search + filter side sheet, open
 * with the full fixture facet set. Each group wears a different chip candidate
 * (cursor sort, underline availability, dot source rows, type genres, kicker
 * platforms) so the candidates can be judged together in context.
 */
import { SHIFT_STORE_ENTRIES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftStorePanel } from "./ShiftStorePanel"
import {
  deriveShiftStoreSources,
  deriveShiftStoreStatuses,
  deriveShiftStoreValues,
} from "./shift-store-query"

const noop = () => undefined

const statusCount = (status: string) =>
  deriveShiftStoreStatuses(SHIFT_STORE_ENTRIES).find(
    facet => facet.value === status,
  )?.count ?? 0

export default {
  designPartId: SHIFT_DESIGN_PARTS.storePanel.id,
  name: "Store Panel",
  note: "Store",
  render: () => (
    <ShiftPartFrame>
      <div
        data-shift-store
        className="intrinsic"
        style={{ position: "relative", width: 380, height: 620 }}
      >
        <ShiftStorePanel
          text=""
          onText={noop}
          sort="relevance"
          onSort={noop}
          availability="available"
          onAvailability={noop}
          availabilityCounts={{
            available: statusCount("available") + statusCount("acquiring"),
            ready: statusCount("ready"),
          }}
          sources={{
            facets: deriveShiftStoreSources(SHIFT_STORE_ENTRIES),
            selected: ["Community"],
            onToggle: noop,
          }}
          genres={{
            facets: deriveShiftStoreValues(
              SHIFT_STORE_ENTRIES,
              entry => entry.genre,
            ),
            selected: [],
            onToggle: noop,
          }}
          platforms={{
            facets: deriveShiftStoreValues(
              SHIFT_STORE_ENTRIES,
              entry => entry.platform,
            ),
            selected: ["Linux"],
            onToggle: noop,
          }}
          resultCount={9}
          activeCount={3}
          onClearAll={noop}
          onClose={noop}
        />
      </div>
    </ShiftPartFrame>
  ),
}
