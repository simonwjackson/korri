/**
 * Reel Actions molecule catalog entry — the Spin / Play cluster.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftReelActions } from "./ShiftReelActions"

export default {
  designPartId: SHIFT_DESIGN_PARTS.reelActions.id,
  name: "Reel Actions",
  note: "Reel",
  render: () => (
    <ShiftPartFrame height={100}>
      <ShiftReelActions onFling={() => undefined} onPlay={() => undefined} />
    </ShiftPartFrame>
  ),
}
