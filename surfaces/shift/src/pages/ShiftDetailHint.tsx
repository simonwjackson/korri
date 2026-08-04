/**
 * Shift game detail — one controller-legend hint (atom).
 *
 * A glyph badge beside its action label (A = play verb, Y = favourite, B =
 * back), shared by the detail button-bar.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftDetailHintProps {
  readonly glyph: string
  readonly label: string
}

export function ShiftDetailHint({ glyph, label }: ShiftDetailHintProps) {
  return (
    <span
      className="shift-detail-hint"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailHint)}
    >
      <span className="shift-detail-hint-glyph" aria-hidden>
        {glyph}
      </span>
      <span>{label}</span>
    </span>
  )
}
