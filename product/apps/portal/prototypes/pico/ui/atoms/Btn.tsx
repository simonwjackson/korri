/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Action button. Visual only. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"

export function Btn({
  children,
  kind,
  sel,
}: {
  readonly children: ReactNode
  readonly kind?: "primary" | "danger" | "ghost"
  readonly sel?: boolean
}) {
  return (
    <span className={`pc-btn ${kind ?? ""} ${sel ? "sel" : ""}`}>
      {children}
    </span>
  )
}
