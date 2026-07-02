/**
 * Detail Actions — the game-detail action cluster as a molecule state family.
 *
 * Two real states driven by play history: a played game offers Continue (+ New
 * Game) with its favourite set, a fresh one offers Play. The SAME
 * `ShiftDetailActions` the detail layouts compose is the one rendered here.
 */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDetailActions } from "./ShiftDetailActions"
import {
  SHIFT_DETAIL_FRESH,
  SHIFT_DETAIL_PLAYED,
} from "./shift-detail-fixtures"

export const ShiftDetailActionsStates = [
  {
    id: "shift-detail-actions-continue",
    designPartId: SHIFT_DESIGN_PARTS.detailActions.id,
    layer: "molecule" as const,
    name: "Detail Actions",
    note: "Action states",
    state: "Continue",
    render: () => (
      <ShiftPartFrame height={140}>
        <ShiftDetailActions game={SHIFT_DETAIL_PLAYED} />
      </ShiftPartFrame>
    ),
  },
  {
    id: "shift-detail-actions-play",
    designPartId: SHIFT_DESIGN_PARTS.detailActions.id,
    layer: "molecule" as const,
    name: "Detail Actions",
    note: "Action states",
    state: "Play",
    render: () => (
      <ShiftPartFrame height={140}>
        <ShiftDetailActions game={SHIFT_DETAIL_FRESH} />
      </ShiftPartFrame>
    ),
  },
] satisfies readonly Story[]
