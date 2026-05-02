/**
 * Shift molecule — focusable menu button.
 *
 * Reuses the HUD chip vocabulary (glyph circle + label) so it sits in
 * the same visual row as `+ Options · X Close · A Continue` rather
 * than reading as a primary CTA on the left and meta hints on the
 * right. Unlike the static chip and input-bus chip, the menu button
 * is focusable; the `.shift-menu-button:focus-visible .shift-hud-glyph`
 * rule in shift.css lights the glyph circle on focus.
 *
 * Activation is delegated to the consumer through `onActivate`. The
 * home surface composes a menu button whose handler opens a future
 * side drawer.
 */

import { Menu } from "lucide-react"
import { ShiftHudGlyph } from "../atoms/ShiftHudGlyph"

export interface ShiftMenuButtonProps {
  readonly label: string
  readonly onActivate?: () => void
}

export function ShiftMenuButton({ label, onActivate }: ShiftMenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className="shift-menu-button"
      aria-label={label}
    >
      <ShiftHudGlyph>
        <Menu strokeWidth={2.5} className="shift-menu-glyph-icon" />
      </ShiftHudGlyph>
      <span className="shift-hud-label">{label}</span>
    </button>
  )
}
