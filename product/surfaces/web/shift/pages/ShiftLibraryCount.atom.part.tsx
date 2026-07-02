/** Library Count atom catalog entry. */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLibraryCount } from "./ShiftLibraryCount"

export default {
  designPartId: SHIFT_DESIGN_PARTS.libraryCount.id,
  name: "Library Count",
  note: "Library",
  render: () => (
    <ShiftPartFrame height={60}>
      <ShiftLibraryCount count={12} />
    </ShiftPartFrame>
  ),
}
