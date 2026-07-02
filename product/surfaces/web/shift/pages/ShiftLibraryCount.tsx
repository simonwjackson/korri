/**
 * Shift library — the game-count label (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function shiftLibraryCountLabel(count: number): string {
  return `${count} ${count === 1 ? "game" : "games"}`
}

export function ShiftLibraryCount({ count }: { readonly count: number }) {
  return (
    <span
      className="shift-lib-count"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.libraryCount)}
    >
      {shiftLibraryCountLabel(count)}
    </span>
  )
}
