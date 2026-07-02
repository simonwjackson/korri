/**
 * pico surface. ATOMIC LAYER: atom.
 *
 * Dimmed inline text. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function Dim({ children }: { readonly children: ReactNode }) {
  return (
    <span className="pc-dim" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}>
      {children}
    </span>
  )
}
