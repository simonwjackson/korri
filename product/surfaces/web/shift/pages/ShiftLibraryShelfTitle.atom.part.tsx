/** Library Shelf Title atom catalog entry. */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLibraryShelfTitle } from "./ShiftLibraryShelfTitle"

export default {
  designPartId: SHIFT_DESIGN_PARTS.libraryShelfTitle.id,
  name: "Library Shelf Title",
  note: "Library",
  render: () => (
    <ShiftPartFrame height={60}>
      <ShiftLibraryShelfTitle title="Continue Playing" />
    </ShiftPartFrame>
  ),
}
