/**
 * Shift library — the Reel "Spin" button (atom).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftReelSpinButton({
  onClick,
}: {
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      className="shift-lib-reel-spin"
      onClick={onClick}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.reelSpinButton)}
    >
      🎰 Spin
    </button>
  )
}
