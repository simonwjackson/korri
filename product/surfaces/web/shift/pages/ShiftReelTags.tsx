/**
 * Shift library — the Reel hero tag line (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftReelTags({ genre }: { readonly genre: string }) {
  return (
    <p
      className="shift-lib-reel-tags"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.reelTags)}
    >
      {genre}
    </p>
  )
}
