/**
 * Lens Sort Overlay molecule catalog entry — the summoned sort toolbar.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLensSortOverlay } from "./ShiftLensSortOverlay"

export default {
  designPartId: SHIFT_DESIGN_PARTS.lensSortOverlay.id,
  name: "Lens Sort Overlay",
  note: "Lens",
  render: () => (
    <ShiftPartFrame height={100}>
      <ShiftLensSortOverlay
        sort="recent"
        sorts={["recent", "title", "playtime"]}
        onPick={() => undefined}
      />
    </ShiftPartFrame>
  ),
}
