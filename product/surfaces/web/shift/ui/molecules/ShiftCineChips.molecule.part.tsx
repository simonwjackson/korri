import { ShiftPartFrame } from "../ShiftPartFrame"
import { SHIFT_PART_GAMES } from "../shift-part-fixtures"
import { ShiftCineChips } from "./ShiftCineChips"

const game = SHIFT_PART_GAMES[0]

export default {
  name: "Chips",
  note: "Glanceable metadata",
  render: () => (
    <ShiftPartFrame width={560} height={120}>
      <ShiftCineChips
        genre={game.genre}
        developer={game.developer}
        lastPlayedLabel={game.lastPlayedLabel}
        playtimeLabel={game.playtimeLabel}
        favorite={game.favorite}
      />
    </ShiftPartFrame>
  ),
}
