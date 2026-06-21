/**
 * Shift organism — home HUD cluster.
 *
 * The bottom-right grouping of action chips. Composition matches the
 * Switch home convention `+ Options · X Close · A Continue` exactly:
 * two `ShiftHudButton` instances bracket a static `ShiftHudChip`. The
 * X chip is decorative — closing software is a system-level action,
 * not a launcher action — so it has no input-bus subscription.
 *
 * Composition (rather than an array prop) is the deliberate choice.
 * Layout, glyph characters, and labels are visible right here at the
 * call site instead of being inferred from a config object.
 */

import { ShiftHudButton } from "../molecules/ShiftHudButton"
import { ShiftHudChip } from "../molecules/ShiftHudChip"

export function ShiftHomeHudCluster() {
  return (
    <div className="flex items-center gap-10">
      <ShiftHudButton action="options" glyph="+" label="Options" />
      <ShiftHudChip glyph="X" label="Close" />
      <ShiftHudButton action="confirm" glyph="A" label="Continue" />
    </div>
  )
}
