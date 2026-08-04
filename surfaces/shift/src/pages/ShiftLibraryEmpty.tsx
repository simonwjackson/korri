/**
 * Shift library — the empty-state line (atom).
 *
 * The `.shift-lib-empty` message each variant falls back to when its query
 * yields nothing ("No games found." / "No favorites yet."). One real atom
 * instead of a repeated inline `<p>`.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftLibraryEmptyProps {
  readonly message?: string
}

export function ShiftLibraryEmpty({
  message = "No games found.",
}: ShiftLibraryEmptyProps) {
  return (
    <p
      className="shift-lib-empty"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.libraryEmpty)}
    >
      {message}
    </p>
  )
}
