/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Small inline chip. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"

export function Chip({ children }: { readonly children: ReactNode }) {
  return <span className="pc-chip">{children}</span>
}
