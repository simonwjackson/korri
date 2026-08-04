/**
 * Shift game detail — the favourite badge (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftDetailFavoriteBadge() {
  return (
    <span
      className="shift-detail-fav"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailFavoriteBadge)}
    >
      ★ Favorite
    </span>
  )
}
