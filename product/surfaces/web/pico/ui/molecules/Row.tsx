/**
 * pico surface. ATOMIC LAYER: molecule.
 *
 * One list row: icon + label/meta + trailing. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function Row({
  icon,
  label,
  meta,
  trailing,
  state = "default",
}: {
  readonly icon?: ReactNode
  readonly label: ReactNode
  readonly meta?: ReactNode
  readonly trailing?: ReactNode
  readonly state?: "default" | "selected"
}) {
  return (
    <div
      className={`pc-row ${state === "selected" ? "sel" : ""}`}
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.row)}
    >
      {icon !== undefined ? <span className="pc-row-ico">{icon}</span> : null}
      <span className="pc-row-text">
        <span className="pc-row-label">{label}</span>
        {meta !== undefined ? (
          <span className="pc-row-meta">{meta}</span>
        ) : null}
      </span>
      {trailing !== undefined ? (
        <span className="pc-row-trail">{trailing}</span>
      ) : null}
    </div>
  )
}
