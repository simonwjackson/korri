/**
 * pico surface. ATOMIC LAYER: atom.
 *
 * Secondary caption line. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function Sub({ children }: { readonly children: ReactNode }) {
  return (
    <div className="pc-sub" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.sub)}>
      {children}
    </div>
  )
}
