/**
 * Shift — the status-bar clock (atom).
 */
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"

export function ShiftClock({ time }: { readonly time: string }) {
  return (
    <span
      className="shift-cine-clock"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.clock)}
    >
      {time}
    </span>
  )
}
