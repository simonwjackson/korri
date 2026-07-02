/**
 * Deck Bleed molecule catalog entry — the blurred full-bleed backdrop + scrim.
 */
import { SHIFT_LIBRARY_GAMES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDeckBleed } from "./ShiftDeckBleed"

const game = SHIFT_LIBRARY_GAMES[0] ?? { id: "g", title: "Game", artUrl: "" }

export default {
  designPartId: SHIFT_DESIGN_PARTS.deckBleed.id,
  name: "Deck Bleed",
  note: "Deck",
  render: () => (
    <ShiftPartFrame height={360}>
      <ShiftDeckBleed artUrl={game.artUrl} gameId={game.id} />
    </ShiftPartFrame>
  ),
}
