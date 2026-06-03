/**
 * Shift molecule — static HUD chip.
 *
 * Decorative glyph + label with no input-bus subscription and no pulse
 * behavior. Used for affordances that the home surface lists but does
 * not handle directly (Switch's `X Close Software` is the canonical
 * example: shown in the cluster, but closing software is a system
 * action).
 *
 * Identical visual vocabulary to `ShiftHudButton` (`.shift-hud` →
 * `.shift-hud-hint` → glyph + label) so the two compose into one
 * cohesive row inside a cluster.
 */

import { ShiftHudGlyph } from "../atoms/ShiftHudGlyph"

export interface ShiftHudChipProps {
  readonly glyph: string
  readonly label: string
}

export function ShiftHudChip({ glyph, label }: ShiftHudChipProps) {
  return (
    <div className="shift-hud" aria-hidden>
      <div className="shift-hud-hint">
        <ShiftHudGlyph>{glyph}</ShiftHudGlyph>
        <span className="shift-hud-label">{label}</span>
      </div>
    </div>
  )
}
