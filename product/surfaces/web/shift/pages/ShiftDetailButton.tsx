/**
 * Shift game detail — an action button (atom).
 *
 * The one `.shift-detail-btn` the detail layouts stamp out: `primary` marks the
 * play/continue verb; `pressed` (when given) drives the favourite toggle's
 * `aria-pressed`.
 */
import type { ReactNode } from "react"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftDetailButtonProps {
  readonly label: ReactNode
  readonly primary?: boolean
  readonly pressed?: boolean
  readonly onClick?: () => void
}

export function ShiftDetailButton({
  label,
  primary = false,
  pressed,
  onClick,
}: ShiftDetailButtonProps) {
  return (
    <button
      type="button"
      className={`shift-detail-btn${primary ? " primary" : ""}`}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      onClick={onClick}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailButton)}
    >
      {label}
    </button>
  )
}
