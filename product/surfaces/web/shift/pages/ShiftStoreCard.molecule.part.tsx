/**
 * Store Card molecule catalog entry — the grid/rail result card across its
 * acquire states (Get vs Play), driven from the real store fixture.
 */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_STORE_ENTRIES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftStoreCard } from "./ShiftStoreCard"
import type { ShiftStoreEntry } from "./shift-store-entry"

const entry: ShiftStoreEntry = SHIFT_STORE_ENTRIES[0] ?? {
  id: "entry",
  title: "Game",
  artUrl: "",
  sources: ["Community"],
  status: "available",
}

const frame = (node: React.ReactNode) => (
  <ShiftPartFrame width={240} height={380}>
    <div data-shift-store className="intrinsic">
      {node}
    </div>
  </ShiftPartFrame>
)

export const ShiftStoreCardStates = [
  {
    id: "shift-store-card-available",
    state: "Available",
    render: () =>
      frame(<ShiftStoreCard entry={{ ...entry, status: "available" }} />),
  },
  {
    id: "shift-store-card-ready",
    state: "Ready",
    render: () =>
      frame(<ShiftStoreCard entry={{ ...entry, status: "ready" }} />),
  },
].map(story => ({
  ...story,
  designPartId: SHIFT_DESIGN_PARTS.storeCard.id,
  layer: "molecule" as const,
  name: "Store Card",
  note: "Card states",
})) satisfies readonly Story[]
