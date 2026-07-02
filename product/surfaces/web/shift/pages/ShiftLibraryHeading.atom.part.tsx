/** Library Heading atom catalog entry. */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLibraryHeading } from "./ShiftLibraryHeading"

export default {
  designPartId: SHIFT_DESIGN_PARTS.libraryHeading.id,
  name: "Library Heading",
  note: "Library",
  render: () => (
    <ShiftPartFrame height={80}>
      <ShiftLibraryHeading title="Library" />
    </ShiftPartFrame>
  ),
}
