/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Action button. Visual only. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function Btn({
  children,
  kind,
  state = "default",
}: {
  readonly children: ReactNode
  readonly kind?: "primary" | "danger" | "ghost"
  readonly state?: "default" | "selected"
}) {
  return (
    <span
      className={`pc-btn ${kind ?? ""} ${state === "selected" ? "sel" : ""}`}
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.btn)}
    >
      {children}
    </span>
  )
}
