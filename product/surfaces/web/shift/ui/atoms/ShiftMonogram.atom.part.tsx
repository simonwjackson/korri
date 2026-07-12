/**
 * Monogram atom catalog entry — the cover-art fallback for art-less games.
 *
 * Renders the real atom for a title with no tile art, so the lab shows the exact
 * glyph (initials + hue) production draws when box art is missing.
 */
import { SHIFT_DESIGN_PARTS } from "../../shift-design-parts"
import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftMonogram } from "./ShiftMonogram"

export default {
  designPartId: SHIFT_DESIGN_PARTS.monogram.id,
  name: "Monogram",
  note: "Library",
  render: () => (
    <ShiftPartFrame width={240} height={360}>
      <ShiftMonogram title="Hollow Knight" />
    </ShiftPartFrame>
  ),
}
