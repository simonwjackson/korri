/**
 * Shift game detail — the title (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftDetailTitle({ title }: { readonly title: string }) {
  return (
    <h1
      className="shift-detail-title"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailTitle)}
    >
      {title}
    </h1>
  )
}
