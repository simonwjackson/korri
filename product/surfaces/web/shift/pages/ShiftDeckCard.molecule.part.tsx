/**
 * Deck Card molecule catalog entry — the riffled cover card.
 */
import { SHIFT_LIBRARY_GAMES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDeckCard } from "./ShiftDeckCard"

const game = SHIFT_LIBRARY_GAMES[0] ?? { id: "g", title: "Game", artUrl: "" }

export default {
  designPartId: SHIFT_DESIGN_PARTS.deckCard.id,
  name: "Deck Card",
  note: "Deck",
  render: () => (
    <ShiftPartFrame height={420}>
      <ShiftDeckCard
        game={game}
        onRiffle={() => undefined}
        onPlay={() => undefined}
      />
    </ShiftPartFrame>
  ),
}
