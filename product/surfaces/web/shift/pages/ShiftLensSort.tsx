/**
 * Shift library — the Lens sort control (atom).
 *
 * A "museum placard": a wide-tracked uppercase eyebrow over the active sort's
 * name, with no fill, border, or pill, so the cover art stays the hero and
 * sorting reads as a quiet caption rather than chrome. Pressing cycles
 * Recent → A–Z → Playtime; focus lifts the value to full ink and tints the
 * eyebrow with the accent. The Lens controls it (sort + onChange); an internal
 * fallback keeps it usable standalone.
 */
import { useState } from "react"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import {
  nextShiftLibrarySort,
  type ShiftLibrarySort,
  shiftLibrarySortLabel,
} from "./shift-library-query"

export interface ShiftLensSortProps {
  readonly sort?: ShiftLibrarySort
  readonly onChange?: (sort: ShiftLibrarySort) => void
}

export function ShiftLensSort({ sort, onChange }: ShiftLensSortProps) {
  const [internal, setInternal] = useState<ShiftLibrarySort>("recent")
  const active = sort ?? internal
  const label = shiftLibrarySortLabel(active)

  const cycle = () => {
    const next = nextShiftLibrarySort(active)
    setInternal(next)
    onChange?.(next)
  }

  return (
    <button
      type="button"
      className="shift-lib-sort"
      aria-label={`Sorted by ${label}. Press to change.`}
      onClick={cycle}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.lensSort)}
    >
      <span className="shift-lib-sort-eyebrow">Sorted by</span>
      <span className="shift-lib-sort-value">{label}</span>
    </button>
  )
}
