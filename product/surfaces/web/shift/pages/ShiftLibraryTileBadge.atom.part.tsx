/** Library Tile Badge atom catalog entry. */
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLibraryTileBadge } from "./ShiftLibraryTileBadge"

export default {
  designPartId: SHIFT_DESIGN_PARTS.libraryTileBadge.id,
  name: "Library Tile Badge",
  note: "Library",
  render: () => (
    <ShiftPartFrame height={60}>
      <ShiftLibraryTileBadge />
    </ShiftPartFrame>
  ),
}
