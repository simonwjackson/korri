/**
 * Shift store — the empty-results line (atom).
 *
 * The message a variant falls back to when a search yields nothing. One real
 * atom instead of a repeated inline `<p>`.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftStoreEmptyProps {
  readonly message?: string
}

export function ShiftStoreEmpty({
  message = "Nothing found. Try another search.",
}: ShiftStoreEmptyProps) {
  return (
    <p
      className="shift-store-empty"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeEmpty)}
    >
      {message}
    </p>
  )
}
