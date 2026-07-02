/**
 * Shift library — the Lens variant's summoned sort overlay (molecule).
 *
 * The sort choices the sort button reveals: a toolbar of sort options that
 * picks one and dismisses itself, so depth appears only while in use.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftLensSortOption } from "./ShiftLensSortOption"
import {
  type ShiftLibrarySort,
  shiftLibrarySortLabel,
} from "./shift-library-query"

export interface ShiftLensSortOverlayProps {
  readonly sort: ShiftLibrarySort
  readonly sorts: readonly ShiftLibrarySort[]
  readonly onPick: (sort: ShiftLibrarySort) => void
}

export function ShiftLensSortOverlay({
  sort,
  sorts,
  onPick,
}: ShiftLensSortOverlayProps) {
  return (
    <div
      className="shift-lib-options"
      role="toolbar"
      aria-label="Sort by"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.lensSortOverlay)}
    >
      {sorts.map(option => (
        <ShiftLensSortOption
          key={option}
          label={shiftLibrarySortLabel(option)}
          active={sort === option}
          onClick={() => onPick(option)}
        />
      ))}
    </div>
  )
}
