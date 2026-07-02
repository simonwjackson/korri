/**
 * Shift library — a shelf title (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftLibraryShelfTitle({ title }: { readonly title: string }) {
  return (
    <h2
      className="shift-lib-shelf-title"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.libraryShelfTitle)}
    >
      {title}
    </h2>
  )
}
