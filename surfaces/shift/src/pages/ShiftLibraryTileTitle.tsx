/**
 * Shift library — the caption under a cover tile (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftLibraryTileTitle({ title }: { readonly title: string }) {
  return (
    <span
      className="shift-lib-tile-title"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.libraryTileTitle)}
    >
      {title}
    </span>
  )
}
