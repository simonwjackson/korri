/**
 * Shift atom — HUD glyph circle.
 *
 * The dark badge that holds a single character or icon (A, B, +, X, the
 * Menu hamburger). Styling lives entirely in `.shift-hud-glyph` in
 * shift.css; this component is a span wrapper that lets molecules
 * compose the glyph alongside `.shift-hud-label` text and a
 * `.shift-hud-hint` row.
 *
 * Children are intentionally `ReactNode` so consumers can pass either
 * a string ("A", "+", "X") or an icon component (Menu glyph). The atom
 * imposes no shape on what goes inside.
 */

import type { ReactNode } from "react"

export interface ShiftHudGlyphProps {
  readonly children: ReactNode
}

export function ShiftHudGlyph({ children }: ShiftHudGlyphProps) {
  return <span className="shift-hud-glyph">{children}</span>
}
