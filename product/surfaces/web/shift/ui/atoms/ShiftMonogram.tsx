/**
 * Shift monogram (atom) — the cover-art fallback for games without tile art.
 *
 * One or two oversized initials on a hue-tinted panel, both derived purely from
 * the title (see `shift-monogram`). It fills its art slot exactly like the cover
 * `<img>` it stands in for, so every surface that shows box art inherits the
 * fallback without knowing about it. Decorative: the surrounding tile already
 * labels the game, so the glyph is hidden from assistive tech.
 */
import type { CSSProperties } from "react"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import { shiftMonogram } from "./shift-monogram"

export interface ShiftMonogramProps {
  readonly title: string
}

export function ShiftMonogram({ title }: ShiftMonogramProps) {
  const { initials, hue } = shiftMonogram(title)
  return (
    <span
      className="shift-monogram"
      style={{ "--shift-monogram-hue": hue } as CSSProperties}
      aria-hidden="true"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.monogram, title)}
    >
      <span className="shift-monogram-initials">{initials}</span>
    </span>
  )
}
