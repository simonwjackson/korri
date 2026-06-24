/**
 * Shift molecule — search pill.
 *
 * At rest the search reads as a quiet icon embedded in the top bar.
 * On focus the pill expands to reveal the placeholder text. Both
 * states are driven entirely from CSS (`.shift-search-pill` and
 * `.shift-search-placeholder` rules in shift.css); this component
 * just wires a focusable `ShiftPill` with the matching class hooks
 * and content.
 *
 * The placeholder text is always rendered so screen readers see it
 * via the surrounding `aria-label`; CSS collapses it visually until
 * the pill is focused.
 *
 * Activation is wired through `onActivate` so a future iteration that
 * routes search through the input bus or a router push has a single
 * obvious seam to plug into.
 */

import { Search } from "lucide-react"
import { ShiftPill } from "../atoms/ShiftPill"

export interface ShiftSearchPillProps {
  readonly placeholder: string
  readonly ariaLabel: string
  readonly onActivate?: () => void
}

export function ShiftSearchPill({
  placeholder,
  ariaLabel,
  onActivate,
}: ShiftSearchPillProps) {
  return (
    <ShiftPill
      onClick={onActivate}
      aria-label={ariaLabel}
      className="shift-search-pill text-[length:var(--shift-text-title)]"
    >
      <Search className="shift-pill-icon shrink-0" strokeWidth={2.25} />
      <span className="shift-search-placeholder">{placeholder}</span>
    </ShiftPill>
  )
}
