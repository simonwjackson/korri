/**
 * Library Header molecule catalog entry — the heading + count bar the library
 * variants share, rendered from the real component.
 */
import { SHIFT_LIBRARY_GAMES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLibraryHeader } from "./ShiftLibraryHeader"

export default {
  designPartId: SHIFT_DESIGN_PARTS.libraryHeader.id,
  name: "Library Header",
  note: "Library",
  render: () => (
    <ShiftPartFrame height={120}>
      <ShiftLibraryHeader title="Library" count={SHIFT_LIBRARY_GAMES.length} />
    </ShiftPartFrame>
  ),
}
