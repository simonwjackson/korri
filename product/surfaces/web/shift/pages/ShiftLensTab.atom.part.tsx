/** Lens Tab atom catalog entry — selected and unselected. */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLensTab } from "./ShiftLensTab"

export const ShiftLensTabStates = [
  { state: "Selected", selected: true },
  { state: "Unselected", selected: false },
].map(({ state, selected }) => ({
  id: `shift-lens-tab-${state.toLowerCase()}`,
  designPartId: SHIFT_DESIGN_PARTS.lensTab.id,
  layer: "atom" as const,
  name: "Lens Tab",
  note: "Tab states",
  state,
  render: () => (
    <ShiftPartFrame height={70}>
      <ShiftLensTab
        label="Favorites"
        selected={selected}
        onClick={() => undefined}
      />
    </ShiftPartFrame>
  ),
})) satisfies readonly Story[]
