/**
 * Shift library — the Reel hero title (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftReelTitle({ title }: { readonly title: string }) {
  return (
    <h1
      className="shift-lib-reel-title"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.reelTitle)}
    >
      {title}
    </h1>
  )
}
