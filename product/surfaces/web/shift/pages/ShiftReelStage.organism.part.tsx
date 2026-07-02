/**
 * Reel Stage organism catalog entry — the spinning wheel of covers, rendered
 * from the real dev library at its resting centre.
 */
import { SHIFT_LIBRARY_GAMES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftReelStage } from "./ShiftReelStage"

export default {
  designPartId: SHIFT_DESIGN_PARTS.reelStage.id,
  name: "Reel Stage",
  note: "Reel",
  render: () => (
    <ShiftPartFrame height={420}>
      <ShiftReelStage
        games={SHIFT_LIBRARY_GAMES}
        center={0}
        onSpin={() => undefined}
      />
    </ShiftPartFrame>
  ),
}
