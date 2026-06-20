/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Secondary caption line. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"

export function Sub({ children }: { readonly children: ReactNode }) {
  return <div className="pc-sub">{children}</div>
}
