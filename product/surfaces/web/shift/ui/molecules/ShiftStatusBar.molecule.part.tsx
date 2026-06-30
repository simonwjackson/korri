/**
 * Status-bar molecule catalog entry. Composes the real `ShiftStatusBar` (and
 * through it the `ShiftBattery` atom), so the dev-lab previews the same chrome
 * the Home mounts. A small state family demonstrates how a child atom's state
 * surfaces at the molecule level.
 */

import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftStatusBar } from "./ShiftStatusBar"

const AVATAR = "https://i.pravatar.cc/96?u=korri-shift-user"
const note = "Power"

export const ShiftStatusBarStates = [
  {
    name: "Status Bar",
    note,
    state: "Charged",
    render: () => (
      <ShiftPartFrame height={140}>
        <ShiftStatusBar avatarSrc={AVATAR} battery={{ level: "full" }} />
      </ShiftPartFrame>
    ),
  },
  {
    name: "Status Bar",
    note,
    state: "Low",
    render: () => (
      <ShiftPartFrame height={140}>
        <ShiftStatusBar avatarSrc={AVATAR} battery={{ level: "low" }} />
      </ShiftPartFrame>
    ),
  },
  {
    name: "Status Bar",
    note,
    state: "Charging",
    render: () => (
      <ShiftPartFrame height={140}>
        <ShiftStatusBar avatarSrc={AVATAR} battery={{ charging: true }} />
      </ShiftPartFrame>
    ),
  },
]
