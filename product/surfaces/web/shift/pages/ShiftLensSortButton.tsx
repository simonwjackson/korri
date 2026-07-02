/**
 * Shift library — the Lens variant's summoned-sort button (atom).
 *
 * The one affordance that reveals sort depth on demand: it shows the active
 * sort and toggles the sort overlay, so sorting stays out of sight until asked
 * for.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import {
  type ShiftLibrarySort,
  shiftLibrarySortLabel,
} from "./shift-library-query"

export interface ShiftLensSortButtonProps {
  readonly sort: ShiftLibrarySort
  readonly open: boolean
  readonly onToggle: () => void
}

export function ShiftLensSortButton({
  sort,
  open,
  onToggle,
}: ShiftLensSortButtonProps) {
  return (
    <button
      type="button"
      className="shift-lib-options-btn"
      aria-expanded={open}
      onClick={onToggle}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.lensSortButton)}
    >
      Sort: {shiftLibrarySortLabel(sort)}
    </button>
  )
}
