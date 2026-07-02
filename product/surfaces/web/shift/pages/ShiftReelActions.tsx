/**
 * Shift library — the Reel action cluster (molecule).
 *
 * The two ways to move the wheel by hand: Spin flings it to a fresh game,
 * Play launches the centred one.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftReelPlayButton } from "./ShiftReelPlayButton"
import { ShiftReelSpinButton } from "./ShiftReelSpinButton"

export interface ShiftReelActionsProps {
  /** Fling the wheel to a fresh game (random-ish jump). */
  readonly onFling: () => void
  readonly onPlay: () => void
}

export function ShiftReelActions({ onFling, onPlay }: ShiftReelActionsProps) {
  return (
    <div
      className="shift-lib-reel-actions"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.reelActions)}
    >
      <ShiftReelSpinButton onClick={onFling} />
      <ShiftReelPlayButton onClick={onPlay} />
    </div>
  )
}
