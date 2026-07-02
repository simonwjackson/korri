/**
 * Shift library — the Reel action cluster (molecule).
 *
 * The two ways to move the wheel by hand: Spin flings it to a fresh game,
 * Play launches the centred one.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftReelActionsProps {
  readonly onSpin: () => void
  readonly onPlay: () => void
}

export function ShiftReelActions({ onSpin, onPlay }: ShiftReelActionsProps) {
  return (
    <div
      className="shift-lib-reel-actions"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.reelActions)}
    >
      <button type="button" className="shift-lib-reel-spin" onClick={onSpin}>
        🎰 Spin
      </button>
      <button type="button" className="shift-lib-reel-play" onClick={onPlay}>
        ▶ Play
      </button>
    </div>
  )
}
