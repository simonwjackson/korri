/**
 * Reel Hero molecule catalog entry — the centered title + genre caption.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftReelHero } from "./ShiftReelHero"

export default {
  designPartId: SHIFT_DESIGN_PARTS.reelHero.id,
  name: "Reel Hero",
  note: "Reel",
  render: () => (
    <ShiftPartFrame height={120}>
      <ShiftReelHero title="Hollow Knight" genre="Metroidvania" />
    </ShiftPartFrame>
  ),
}
