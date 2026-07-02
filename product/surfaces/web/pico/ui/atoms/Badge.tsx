/**
 * pico surface. ATOMIC LAYER: atom.
 *
 * Small status badge. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function Badge({
  children,
  tone,
}: {
  readonly children: ReactNode
  readonly tone?: "accent" | "good" | "bad" | "info"
}) {
  return (
    <span
      className={`pc-badge ${tone ?? ""}`}
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.badge)}
    >
      {children}
    </span>
  )
}
