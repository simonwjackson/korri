/**
 * Status-bar molecule catalog entry.
 *
 * The lab shows one real Status Bar molecule. Its Power, Clock, and Network
 * dropdowns are supplied by the Shift surface adapter and feed real inputs
 * through the `ShiftStatusBar` → `ShiftBattery` composition.
 */

import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftStatusBar } from "./ShiftStatusBar"

const AVATAR = "https://i.pravatar.cc/96?u=korri-shift-user"

export default {
  name: "Status Bar",
  note: "Status",
  render: () => (
    <ShiftPartFrame height={140}>
      <ShiftStatusBar avatarSrc={AVATAR} />
    </ShiftPartFrame>
  ),
}
