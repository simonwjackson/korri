/**
 * Shift library — the favourite star badge on a cover tile (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftLibraryTileBadge() {
  return (
    <span
      className="shift-lib-tile-fav"
      aria-hidden
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.libraryTileBadge)}
    >
      ★
    </span>
  )
}
