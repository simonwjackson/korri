/**
 * Detail Hints — the game-detail controller legend as a molecule state family.
 *
 * The A-glyph verb follows the same play-history rule as the actions cluster
 * (Continue for a played game, Play for a fresh one), so the two real states
 * mirror `ShiftDetailActions`. The SAME `ShiftDetailHints` the detail layouts
 * compose is the one rendered here.
 */
import type { Story } from "@simonwjackson/caliper"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDetailHints } from "./ShiftDetailHints"
import {
  SHIFT_DETAIL_FRESH,
  SHIFT_DETAIL_PLAYED,
} from "./shift-detail-fixtures"

export const ShiftDetailHintsStates = [
  {
    id: "shift-detail-hints-continue",
    designPartId: SHIFT_DESIGN_PARTS.detailHints.id,
    layer: "molecule" as const,
    name: "Detail Hints",
    note: "Hint states",
    state: "Continue",
    render: () => (
      <ShiftPartFrame height={120}>
        <ShiftDetailHints game={SHIFT_DETAIL_PLAYED} />
      </ShiftPartFrame>
    ),
  },
  {
    id: "shift-detail-hints-play",
    designPartId: SHIFT_DESIGN_PARTS.detailHints.id,
    layer: "molecule" as const,
    name: "Detail Hints",
    note: "Hint states",
    state: "Play",
    render: () => (
      <ShiftPartFrame height={120}>
        <ShiftDetailHints game={SHIFT_DETAIL_FRESH} />
      </ShiftPartFrame>
    ),
  },
] satisfies readonly Story[]
