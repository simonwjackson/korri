/**
 * Store Source Chip atom catalog entry — the source toggle across its real
 * states (idle, active, counted) and the sort-cycle chip that shares its pill.
 */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftStoreSourceChip } from "./ShiftStoreSourceChip"

const frame = (node: React.ReactNode) => (
  <ShiftPartFrame height={80}>
    <div data-shift-store className="intrinsic">
      {node}
    </div>
  </ShiftPartFrame>
)

export const ShiftStoreSourceChipStates = [
  {
    id: "shift-store-chip-idle",
    state: "Idle",
    render: () =>
      frame(
        <ShiftStoreSourceChip
          label="itch.io"
          count={6}
          active={false}
          onClick={() => undefined}
        />,
      ),
  },
  {
    id: "shift-store-chip-active",
    state: "Active",
    render: () =>
      frame(
        <ShiftStoreSourceChip
          label="itch.io"
          count={6}
          active
          onClick={() => undefined}
        />,
      ),
  },
  {
    id: "shift-store-chip-sort",
    state: "Sort",
    render: () =>
      frame(
        <ShiftStoreSourceChip
          sort
          label="Sort: Relevance"
          onClick={() => undefined}
        />,
      ),
  },
].map(story => ({
  ...story,
  designPartId: SHIFT_DESIGN_PARTS.storeChip.id,
  layer: "atom" as const,
  name: "Store Source Chip",
  note: "Chip states",
})) satisfies readonly Story[]
