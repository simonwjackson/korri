/**
 * Lens Sort Button atom catalog entry — the summoned-sort button in its
 * closed and open (expanded) states.
 */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLensSortButton } from "./ShiftLensSortButton"

export const ShiftLensSortButtonStates = [
  { state: "Closed", open: false },
  { state: "Open", open: true },
].map(({ state, open }) => ({
  id: `shift-lens-sort-button-${state.toLowerCase()}`,
  designPartId: SHIFT_DESIGN_PARTS.lensSortButton.id,
  layer: "atom" as const,
  name: "Lens Sort Button",
  note: "Sort states",
  state,
  render: () => (
    <ShiftPartFrame height={80}>
      <ShiftLensSortButton
        sort="recent"
        open={open}
        onToggle={() => undefined}
      />
    </ShiftPartFrame>
  ),
})) satisfies readonly Story[]
