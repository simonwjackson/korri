import { ShiftPartFrame } from "../ShiftPartFrame"
import { SHIFT_PART_GAMES } from "../shift-part-fixtures"
import { ShiftCineBackdrop } from "./ShiftCineBackdrop"

const game = SHIFT_PART_GAMES[0]
const note = "Mood"

export const ShiftCineBackdropStates = [
  {
    name: "Backdrop",
    note,
    state: "Default",
    render: () => (
      <ShiftPartFrame>
        <ShiftCineBackdrop artUrl={game.wideArtUrl} />
      </ShiftPartFrame>
    ),
  },
  {
    name: "Backdrop",
    note,
    state: "Cooled",
    render: () => (
      <ShiftPartFrame>
        <ShiftCineBackdrop artUrl={game.wideArtUrl} cooled />
      </ShiftPartFrame>
    ),
  },
]
