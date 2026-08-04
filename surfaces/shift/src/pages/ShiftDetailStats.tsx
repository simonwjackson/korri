/**
 * Shift game detail — the play-history stats row (molecule).
 *
 * Last-played (or "Never played"), optional playtime, and the favourite badge
 * for the detail info column.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftDetailFavoriteBadge } from "./ShiftDetailFavoriteBadge"

export interface ShiftDetailStatsProps {
  readonly lastPlayedLabel?: string
  readonly playtimeLabel?: string
  readonly favorite?: boolean
}

export function ShiftDetailStats({
  lastPlayedLabel,
  playtimeLabel,
  favorite,
}: ShiftDetailStatsProps) {
  return (
    <div
      className="shift-detail-stats"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailStats)}
    >
      <span>
        {lastPlayedLabel ? `Last played ${lastPlayedLabel}` : "Never played"}
      </span>
      {playtimeLabel ? <span>{playtimeLabel} played</span> : null}
      {favorite ? <ShiftDetailFavoriteBadge /> : null}
    </div>
  )
}
