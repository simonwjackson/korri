/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Dimmed inline text. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"

export function Dim({ children }: { readonly children: ReactNode }) {
  return <span className="pc-dim">{children}</span>
}
