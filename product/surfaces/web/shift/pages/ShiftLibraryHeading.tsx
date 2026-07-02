/**
 * Shift library — the library heading (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftLibraryHeading({ title }: { readonly title: string }) {
  return (
    <h1
      className="shift-lib-heading"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.libraryHeading)}
    >
      {title}
    </h1>
  )
}
