/**
 * Cover Art atom catalog entry — the shared game-cover image.
 */
import { SHIFT_LIBRARY_GAMES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftCoverArt } from "./ShiftCoverArt"

const game = SHIFT_LIBRARY_GAMES[0] ?? { id: "g", title: "Game", artUrl: "" }

export default {
  designPartId: SHIFT_DESIGN_PARTS.coverArt.id,
  name: "Cover Art",
  note: "Library",
  render: () => (
    <ShiftPartFrame width={240} height={360}>
      <ShiftCoverArt src={game.artUrl} loading="lazy" />
    </ShiftPartFrame>
  ),
}
