/**
 * Shift game detail — the key-art panel (atom).
 *
 * The full-height cover image that holds one edge of the detail split.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftDetailArtProps {
  readonly artUrl: string
}

export function ShiftDetailArt({ artUrl }: ShiftDetailArtProps) {
  return (
    <div
      className="shift-detail-split-art"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailArt)}
    >
      <img src={artUrl} alt="" loading="lazy" />
    </div>
  )
}
