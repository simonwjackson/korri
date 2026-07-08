/**
 * Shift Game Detail — action states as a part-catalog state family.
 *
 * The detail screen's primary action has two real states driven by play history:
 * a played game offers Continue (+ New Game), a fresh one offers Play. Each is a
 * fixture-backed variant so the dev-lab States panel can switch between them
 * while inspecting the part. Static (no backend, no router).
 */
import type { Story } from "@simonwjackson/caliper"
import { ShiftDetailSplit } from "./pages/ShiftDetailSplit"
import {
  SHIFT_DETAIL_FRESH,
  SHIFT_DETAIL_PLAYED,
} from "./pages/shift-detail-fixtures"

const played = SHIFT_DETAIL_PLAYED
const fresh = SHIFT_DETAIL_FRESH

export const ShiftGameDetailStates = [
  {
    id: "shift-game-detail-continue",
    layer: "page" as const,
    name: "Game Detail",
    note: "Action states",
    surface: true,
    state: "Continue",
    render: () => <ShiftDetailSplit game={played} />,
  },
  {
    id: "shift-game-detail-play",
    layer: "page" as const,
    name: "Game Detail",
    note: "Action states",
    surface: true,
    state: "Play",
    render: () => <ShiftDetailSplit game={fresh} />,
  },
] satisfies readonly Story[]
