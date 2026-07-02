/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Small inline chip. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function Chip({ children }: { readonly children: ReactNode }) {
  return (
    <span className="pc-chip" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.chip)}>
      {children}
    </span>
  )
}
