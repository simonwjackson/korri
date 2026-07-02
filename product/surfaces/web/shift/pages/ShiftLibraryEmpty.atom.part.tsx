/**
 * Library Empty atom catalog entry — the empty-state message line.
 */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLibraryEmpty } from "./ShiftLibraryEmpty"

export default {
  designPartId: SHIFT_DESIGN_PARTS.libraryEmpty.id,
  name: "Library Empty",
  note: "Library",
  render: () => (
    <ShiftPartFrame height={100}>
      <ShiftLibraryEmpty />
    </ShiftPartFrame>
  ),
}
