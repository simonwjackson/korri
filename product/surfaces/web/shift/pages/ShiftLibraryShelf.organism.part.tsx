/**
 * Library Shelf organism catalog entry — one titled shelf of cover tiles,
 * rendered from the first real library section.
 */
import { SHIFT_LIBRARY_SECTIONS } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLibraryShelf } from "./ShiftLibraryShelf"

const section = SHIFT_LIBRARY_SECTIONS[0]

export default {
  designPartId: SHIFT_DESIGN_PARTS.libraryShelf.id,
  name: "Library Shelf",
  note: "Library",
  render: () => (
    <ShiftPartFrame height={360}>
      <ShiftLibraryShelf
        title={section?.title ?? "Shelf"}
        games={section?.games ?? []}
      />
    </ShiftPartFrame>
  ),
}
