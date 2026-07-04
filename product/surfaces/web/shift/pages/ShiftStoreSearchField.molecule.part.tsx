/**
 * Store Search molecule catalog entry — the search field, rendered empty and
 * with a typed query so the two real presentation states are both visible.
 */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftStoreSearchField } from "./ShiftStoreSearchField"

const frame = (node: React.ReactNode) => (
  <ShiftPartFrame height={120}>
    <div data-shift-store className="intrinsic" style={{ width: "100%" }}>
      {node}
    </div>
  </ShiftPartFrame>
)

export const ShiftStoreSearchFieldStates = [
  {
    id: "shift-store-search-empty",
    state: "Empty",
    render: () =>
      frame(<ShiftStoreSearchField value="" onChange={() => undefined} />),
  },
  {
    id: "shift-store-search-typed",
    state: "Typed",
    render: () =>
      frame(
        <ShiftStoreSearchField value="hollow" onChange={() => undefined} />,
      ),
  },
].map(story => ({
  ...story,
  designPartId: SHIFT_DESIGN_PARTS.storeSearch.id,
  layer: "molecule" as const,
  name: "Store Search",
  note: "Search states",
})) satisfies readonly Story[]
