/**
 * Store Result Row molecule catalog entry — the dense list row across its
 * acquire states (Get vs Play), driven from the real store fixture.
 */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_STORE_ENTRIES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftStoreResultRow } from "./ShiftStoreResultRow"
import type { ShiftStoreEntry } from "./shift-store-entry"

const entry: ShiftStoreEntry = SHIFT_STORE_ENTRIES[0] ?? {
  id: "entry",
  title: "Game",
  artUrl: "",
  sources: ["Community"],
  status: "available",
}

const frame = (node: React.ReactNode) => (
  <ShiftPartFrame width={520} height={140}>
    <div data-shift-store className="intrinsic" style={{ width: "100%" }}>
      {node}
    </div>
  </ShiftPartFrame>
)

export const ShiftStoreResultRowStates = [
  {
    id: "shift-store-row-available",
    state: "Available",
    render: () =>
      frame(<ShiftStoreResultRow entry={{ ...entry, status: "available" }} />),
  },
  {
    id: "shift-store-row-ready",
    state: "Ready",
    render: () =>
      frame(<ShiftStoreResultRow entry={{ ...entry, status: "ready" }} />),
  },
].map(story => ({
  ...story,
  designPartId: SHIFT_DESIGN_PARTS.storeResultRow.id,
  layer: "molecule" as const,
  name: "Store Result Row",
  note: "Row states",
})) satisfies readonly Story[]
