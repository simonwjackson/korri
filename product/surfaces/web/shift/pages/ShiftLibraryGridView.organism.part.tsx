/**
 * Library Grid View organism catalog entry — the additive cover grid, rendered
 * from the real dev-media projection.
 */
import { SHIFT_LIBRARY_GAMES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLibraryGridView } from "./ShiftLibraryGridView"

export default {
  designPartId: SHIFT_DESIGN_PARTS.libraryGridView.id,
  name: "Library Grid View",
  note: "Library",
  render: () => (
    <ShiftPartFrame height={520}>
      <ShiftLibraryGridView games={SHIFT_LIBRARY_GAMES} />
    </ShiftPartFrame>
  ),
}
