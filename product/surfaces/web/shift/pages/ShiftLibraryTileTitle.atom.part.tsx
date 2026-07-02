/** Library Tile Title atom catalog entry. */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLibraryTileTitle } from "./ShiftLibraryTileTitle"

export default {
  designPartId: SHIFT_DESIGN_PARTS.libraryTileTitle.id,
  name: "Library Tile Title",
  note: "Library",
  render: () => (
    <ShiftPartFrame width={220} height={60}>
      <ShiftLibraryTileTitle title="Hollow Knight" />
    </ShiftPartFrame>
  ),
}
