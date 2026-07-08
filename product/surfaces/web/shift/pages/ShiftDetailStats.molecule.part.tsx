/**
 * Detail Stats molecule catalog entry — play-history row across its real
 * states: played (with playtime + favourite) and never-played.
 */
import type { Story } from "@simonwjackson/caliper"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDetailStats } from "./ShiftDetailStats"
import {
  SHIFT_DETAIL_FRESH,
  SHIFT_DETAIL_PLAYED,
} from "./shift-detail-fixtures"

export const ShiftDetailStatsStates = [
  { state: "Played", game: SHIFT_DETAIL_PLAYED },
  { state: "Fresh", game: SHIFT_DETAIL_FRESH },
].map(({ state, game }) => ({
  id: `shift-detail-stats-${state.toLowerCase()}`,
  designPartId: SHIFT_DESIGN_PARTS.detailStats.id,
  layer: "molecule" as const,
  name: "Detail Stats",
  note: "Stat states",
  state,
  render: () => (
    <ShiftPartFrame height={80}>
      <ShiftDetailStats
        lastPlayedLabel={game.lastPlayedLabel}
        playtimeLabel={game.playtimeLabel}
        favorite={game.favorite}
      />
    </ShiftPartFrame>
  ),
})) satisfies readonly Story[]
