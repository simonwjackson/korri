/**
 * Shift library — the Reel "Play" button (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftReelPlayButton({
  onClick,
}: {
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      className="shift-lib-reel-play"
      onClick={onClick}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.reelPlayButton)}
    >
      ▶ Play
    </button>
  )
}
