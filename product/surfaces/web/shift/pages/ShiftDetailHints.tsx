/**
 * Shift game detail — button-hint bar (shared atom).
 *
 * The controller legend shared by the detail rebalances: A maps to the primary
 * verb, Y to favourite, B to back. Layouts decide where the bar sits.
 */

import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { shiftDetailPlayLabel } from "./shift-detail-copy"
import type { ShiftGameDetailView } from "./shift-game-detail-view"

export function ShiftDetailHints({
  game,
}: {
  readonly game: ShiftGameDetailView
}) {
  return (
    <div
      className="shift-detail-buttonbar"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailHints)}
    >
      <Hint glyph="A" label={shiftDetailPlayLabel(game)} />
      <Hint glyph="Y" label="Favorite" />
      <Hint glyph="B" label="Back" />
    </div>
  )
}

function Hint({
  glyph,
  label,
}: {
  readonly glyph: string
  readonly label: string
}) {
  return (
    <span className="shift-detail-hint">
      <span className="shift-detail-hint-glyph" aria-hidden>
        {glyph}
      </span>
      <span>{label}</span>
    </span>
  )
}
