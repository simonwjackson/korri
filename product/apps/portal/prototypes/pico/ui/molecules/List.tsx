/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * A selectable list container. Pass rows; mark the selected one. Moved from
 * `kit.tsx`.
 */
import type { ReactNode } from "react"

export function List({ children }: { readonly children: ReactNode }) {
  return <div className="pc-list">{children}</div>
}
