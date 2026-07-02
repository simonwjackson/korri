/**
 * Shift library — one Lens tab (atom).
 *
 * A single lens choice in the Lens variant's tablist (All / Favorites / By
 * Genre); `selected` drives both `aria-selected` and `data-active`.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftLensTabProps {
  readonly label: string
  readonly selected: boolean
  readonly onClick: () => void
}

export function ShiftLensTab({ label, selected, onClick }: ShiftLensTabProps) {
  return (
    <button
      type="button"
      role="tab"
      className="shift-lib-lens-item"
      aria-selected={selected}
      data-active={selected || undefined}
      onClick={onClick}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.lensTab)}
    >
      {label}
    </button>
  )
}
