/**
 * Shift library — one Lens sort option (atom).
 *
 * A sort choice in the summoned sort toolbar; `active` drives both
 * `data-active` and `aria-pressed`.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftLensSortOptionProps {
  readonly label: string
  readonly active: boolean
  readonly onClick: () => void
}

export function ShiftLensSortOption({
  label,
  active,
  onClick,
}: ShiftLensSortOptionProps) {
  return (
    <button
      type="button"
      className="shift-lib-option"
      data-active={active || undefined}
      aria-pressed={active}
      onClick={onClick}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.lensSortOption)}
    >
      {label}
    </button>
  )
}
