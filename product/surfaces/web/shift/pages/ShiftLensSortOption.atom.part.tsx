/** Lens Sort Option atom catalog entry — active and inactive. */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLensSortOption } from "./ShiftLensSortOption"

export const ShiftLensSortOptionStates = [
  { state: "Active", active: true },
  { state: "Inactive", active: false },
].map(({ state, active }) => ({
  id: `shift-lens-sort-option-${state.toLowerCase()}`,
  designPartId: SHIFT_DESIGN_PARTS.lensSortOption.id,
  layer: "atom" as const,
  name: "Lens Sort Option",
  note: "Option states",
  state,
  render: () => (
    <ShiftPartFrame height={70}>
      <ShiftLensSortOption
        label="Recent"
        active={active}
        onClick={() => undefined}
      />
    </ShiftPartFrame>
  ),
})) satisfies readonly Story[]
