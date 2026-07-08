/**
 * Lens Row molecule catalog entry — the All / Favorites / By Genre tablist as
 * a lens-selection state family (which lens is active).
 */
import type { Story } from "@simonwjackson/caliper"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { SHIFT_LIBRARY_LENSES, ShiftLensRow } from "./ShiftLensRow"

export const ShiftLensRowStates = SHIFT_LIBRARY_LENSES.map(option => ({
  id: `shift-lens-row-${option.id}`,
  designPartId: SHIFT_DESIGN_PARTS.lensRow.id,
  layer: "molecule" as const,
  name: "Lens Row",
  note: "Lens states",
  state: option.label,
  render: () => (
    <ShiftPartFrame height={100}>
      <ShiftLensRow lens={option.id} onSelect={() => undefined} />
    </ShiftPartFrame>
  ),
})) satisfies readonly Story[]
