/**
 * Reel Cover molecule catalog entry — the wheel cover in its centre (hero) and
 * peeking (off-centre) states.
 */
import type { Story } from "@simonwjackson/caliper"
import { SHIFT_LIBRARY_GAMES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftReelCover } from "./ShiftReelCover"

const game = SHIFT_LIBRARY_GAMES[0] ?? { id: "g", title: "Game", artUrl: "" }

export const ShiftReelCoverStates = [
  { state: "Center", offset: 0, isCenter: true },
  { state: "Peek", offset: 1, isCenter: false },
].map(({ state, offset, isCenter }) => ({
  id: `shift-reel-cover-${state.toLowerCase()}`,
  designPartId: SHIFT_DESIGN_PARTS.reelCover.id,
  layer: "molecule" as const,
  name: "Reel Cover",
  note: "Cover states",
  state,
  render: () => (
    <ShiftPartFrame width={260} height={360}>
      <ShiftReelCover
        game={game}
        offset={offset}
        isCenter={isCenter}
        onActivate={() => undefined}
      />
    </ShiftPartFrame>
  ),
})) satisfies readonly Story[]
