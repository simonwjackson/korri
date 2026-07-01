import type { ReactNode } from "react"
import { SHIFT_DESIGN_PARTS } from "../../shift-design-parts"
import { ShiftPartFrame } from "../ShiftPartFrame"
import { SHIFT_PART_GAMES } from "../shift-part-fixtures"
import { ShiftCineTile } from "./ShiftCineTile"

const game = SHIFT_PART_GAMES[0]
const note = "Focus"
const noop = () => {}
const frame = (children: ReactNode) => (
  <ShiftPartFrame width={260} height={320}>
    {children}
  </ShiftPartFrame>
)

export const ShiftCineTileStates = [
  {
    designPartId: SHIFT_DESIGN_PARTS.tile.id,
    name: "Tile",
    note,
    state: "Resting",
    render: () =>
      frame(
        <ShiftCineTile
          index={0}
          title={game.title}
          artUrl={game.tileArtUrl}
          onFocus={noop}
          onActivate={noop}
        />,
      ),
  },
  {
    designPartId: SHIFT_DESIGN_PARTS.tile.id,
    name: "Tile",
    note,
    state: "Focused",
    render: () =>
      frame(
        <ShiftCineTile
          index={0}
          title={game.title}
          artUrl={game.tileArtUrl}
          focused
          onFocus={noop}
          onActivate={noop}
        />,
      ),
  },
]
