/**
 * Shift game detail — the synopsis paragraph (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftDetailSynopsis({
  children,
}: {
  readonly children: string
}) {
  return (
    <p
      className="shift-detail-synopsis"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailSynopsis)}
    >
      {children}
    </p>
  )
}
