/**
 * Filter Chip atom catalog entry — the toggle/genre/sort chip across its real
 * presentation states (idle toggle, active toggle, counted genre, sort cycle).
 */
import type { Story } from "@simonwjackson/caliper"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLibraryFilterChip } from "./ShiftLibraryFilterChip"

const frame = (node: React.ReactNode) => (
  <ShiftPartFrame height={80}>{node}</ShiftPartFrame>
)

export const ShiftLibraryFilterChipStates = [
  {
    id: "shift-filter-chip-idle",
    state: "Idle",
    render: () =>
      frame(
        <ShiftLibraryFilterChip
          label="★ Favorites"
          active={false}
          onClick={() => undefined}
        />,
      ),
  },
  {
    id: "shift-filter-chip-active",
    state: "Active",
    render: () =>
      frame(
        <ShiftLibraryFilterChip
          label="★ Favorites"
          active
          onClick={() => undefined}
        />,
      ),
  },
  {
    id: "shift-filter-chip-genre",
    state: "Genre",
    render: () =>
      frame(
        <ShiftLibraryFilterChip
          label="Adventure"
          count={4}
          active={false}
          onClick={() => undefined}
        />,
      ),
  },
  {
    id: "shift-filter-chip-sort",
    state: "Sort",
    render: () =>
      frame(
        <ShiftLibraryFilterChip
          sort
          label="Sort: Recent"
          onClick={() => undefined}
        />,
      ),
  },
].map(story => ({
  ...story,
  designPartId: SHIFT_DESIGN_PARTS.filterChip.id,
  layer: "atom" as const,
  name: "Filter Chip",
  note: "Chip states",
})) satisfies readonly Story[]
