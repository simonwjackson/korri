/**
 * Status-bar molecule catalog entry.
 *
 * The lab shows one real Status Bar molecule. Its Power, Clock, and Network
 * dropdowns are supplied by the Shift surface adapter and feed real inputs
 * through the `ShiftStatusBar` → `ShiftBattery` composition.
 */

import { SHIFT_DESIGN_PARTS } from "../../shift-design-parts"
import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftStatusBar } from "./ShiftStatusBar"

export default {
  designPartId: SHIFT_DESIGN_PARTS.statusBar.id,
  name: "Status Bar",
  note: "Status",
  render: () => (
    <ShiftPartFrame height={140}>
      <ShiftStatusBar />
    </ShiftPartFrame>
  ),
}
