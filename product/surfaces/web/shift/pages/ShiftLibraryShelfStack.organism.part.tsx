/**
 * Library Shelf Stack organism catalog entry — the stack of titled shelves
 * shared by Shelves and Lens By-Genre, rendered from the real sections.
 */
import { SHIFT_LIBRARY_SECTIONS } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLibraryShelfStack } from "./ShiftLibraryShelfStack"

export default {
  designPartId: SHIFT_DESIGN_PARTS.libraryShelfStack.id,
  name: "Library Shelf Stack",
  note: "Library",
  render: () => (
    <ShiftPartFrame height={520}>
      <ShiftLibraryShelfStack sections={SHIFT_LIBRARY_SECTIONS} />
    </ShiftPartFrame>
  ),
}
