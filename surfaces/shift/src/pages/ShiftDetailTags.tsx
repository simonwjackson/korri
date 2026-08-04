/**
 * Shift game detail — the genre · developer tag line (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftDetailTags({ tags }: { readonly tags: string }) {
  return (
    <div
      className="shift-detail-tags"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailTags)}
    >
      {tags}
    </div>
  )
}
