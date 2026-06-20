/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * A big centered status glyph (e.g. ⚠ ✓ ✕ ⏻). Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"

export function Glyph({
  children,
  tone,
}: {
  readonly children: ReactNode
  readonly tone?: "accent" | "good" | "bad" | "info"
}) {
  return <div className={`pc-glyph ${tone ?? ""}`}>{children}</div>
}
