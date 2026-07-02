/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * A big centered status glyph (e.g. ⚠ ✓ ✕ ⏻). Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function Glyph({
  children,
  tone,
}: {
  readonly children: ReactNode
  readonly tone?: "accent" | "good" | "bad" | "info"
}) {
  return (
    <div
      className={`pc-glyph ${tone ?? ""}`}
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.glyph)}
    >
      {children}
    </div>
  )
}
