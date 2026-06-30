import { ShiftPartFrame } from "../ShiftPartFrame"
import { SHIFT_PART_GAMES } from "../shift-part-fixtures"
import { ShiftCineRail } from "./ShiftCineRail"

const games = SHIFT_PART_GAMES.slice(0, 8)
const noop = () => {}

export default {
  name: "Rail",
  note: "Cinematic",
  render: () => (
    <ShiftPartFrame width={640} height={360}>
      <ShiftCineRail
        games={games}
        index={2}
        trackX={0}
        trackRef={null}
        onTileFocus={noop}
        onTileActivate={noop}
      />
    </ShiftPartFrame>
  ),
}
