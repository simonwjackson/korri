/**
 * Shift store — source badge (atom).
 *
 * The quiet label naming where an entry was discovered (its remote source). It
 * stands in for the price tag a console store would show here: the store is
 * about provenance, not cost, so the eye lands on "itch.io" or "Community",
 * never a number.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftStoreSourceBadgeProps {
  readonly source: string
}

export function ShiftStoreSourceBadge({ source }: ShiftStoreSourceBadgeProps) {
  return (
    <span
      className="shift-store-source"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeSourceBadge)}
    >
      {source}
    </span>
  )
}
