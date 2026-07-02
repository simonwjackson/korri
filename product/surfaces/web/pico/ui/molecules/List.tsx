/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * A selectable list container. Pass rows; mark the selected one. Moved from
 * `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function List({ children }: { readonly children: ReactNode }) {
  return (
    <div className="pc-list" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.list)}>
      {children}
    </div>
  )
}
