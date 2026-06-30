import type { LaunchStatusView } from "../../launch-failure-copy"
import { ShiftPartFrame } from "../ShiftPartFrame"
import { SHIFT_PART_GAMES } from "../shift-part-fixtures"
import { ShiftCineHero } from "./ShiftCineHero"

const game = SHIFT_PART_GAMES[0]
const note = "Launch"

const hero = (status: LaunchStatusView | null, resuming: boolean) => (
  <ShiftPartFrame>
    <ShiftCineHero game={game} status={status} resuming={resuming} />
  </ShiftPartFrame>
)

export const ShiftCineHeroStates = [
  {
    name: "Hero",
    note,
    state: "Ready",
    render: () => hero(null, false),
  },
  {
    name: "Hero",
    note,
    state: "Continue",
    render: () => hero(null, true),
  },
  {
    name: "Hero",
    note,
    state: "Launching",
    render: () =>
      hero({ tone: "launching", kicker: "Starting…", canRetry: false }, false),
  },
  {
    name: "Hero",
    note,
    state: "Failed",
    render: () =>
      hero(
        {
          tone: "failed",
          kicker: "Couldn't start",
          reason: "It didn't start",
          canRetry: true,
        },
        false,
      ),
  },
  {
    name: "Hero",
    note,
    state: "Unavailable",
    render: () =>
      hero(
        {
          tone: "unavailable",
          kicker: "Not playable here",
          reason: "Unavailable on this device",
          canRetry: false,
        },
        false,
      ),
  },
]
