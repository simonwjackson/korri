/**
 * Shift library — the Lens variant's lens row (molecule).
 *
 * The single standing control of the Lens variant: a tablist that reframes the
 * same games (All / Favorites / By Genre) without any sort/filter chrome
 * competing with the covers.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export type ShiftLibraryLens = "all" | "favorites" | "genre"

export const SHIFT_LIBRARY_LENSES: readonly {
  readonly id: ShiftLibraryLens
  readonly label: string
}[] = [
  { id: "all", label: "All" },
  { id: "favorites", label: "Favorites" },
  { id: "genre", label: "By Genre" },
]

export interface ShiftLensRowProps {
  readonly lens: ShiftLibraryLens
  readonly onSelect: (lens: ShiftLibraryLens) => void
}

export function ShiftLensRow({ lens, onSelect }: ShiftLensRowProps) {
  return (
    <div
      className="shift-lib-lens-row"
      role="tablist"
      aria-label="Library lens"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.lensRow)}
    >
      {SHIFT_LIBRARY_LENSES.map(option => (
        <button
          type="button"
          key={option.id}
          role="tab"
          className="shift-lib-lens-item"
          aria-selected={lens === option.id}
          data-active={lens === option.id || undefined}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
