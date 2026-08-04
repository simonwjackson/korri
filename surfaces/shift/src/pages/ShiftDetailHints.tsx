/**
 * Shift game detail — button-hint bar (shared atom).
 *
 * The controller legend shared by the detail rebalances: A maps to the primary
 * verb, Y to favourite, B to back. Layouts decide where the bar sits.
 */

import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftDetailHint } from "./ShiftDetailHint"
import { shiftDetailPlayLabel } from "./shift-detail-copy"
import type { ShiftGameDetailView } from "./shift-game-detail-view"

export function ShiftDetailHints({
  game,
  favoriteAvailable = false,
}: {
  readonly game: ShiftGameDetailView
  readonly favoriteAvailable?: boolean
}) {
  return (
    <div
      className="shift-detail-buttonbar"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailHints)}
    >
      <ShiftDetailHint glyph="A" label={shiftDetailPlayLabel(game)} />
      {favoriteAvailable ? <ShiftDetailHint glyph="Y" label="Favorite" /> : null}
      <ShiftDetailHint glyph="B" label="Back" />
    </div>
  )
}
