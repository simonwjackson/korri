/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Small status badge. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"

export function Badge({
  children,
  tone,
}: {
  readonly children: ReactNode
  readonly tone?: "accent" | "good" | "bad" | "info"
}) {
  return <span className={`pc-badge ${tone ?? ""}`}>{children}</span>
}
