/**
 * Battery atom catalog entry.
 *
 * The lab shows one real Battery atom. Its Power dropdown is supplied by the
 * Shift surface adapter and feeds `level` / `charging` into this same component
 * instead of switching between pre-baked snapshots.
 */

import { SHIFT_DESIGN_PARTS } from "../../shift-design-parts"
import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftBattery } from "./ShiftBattery"

export default {
  designPartId: SHIFT_DESIGN_PARTS.battery.id,
  name: "Battery",
  note: "Power",
  render: () => (
    <ShiftPartFrame width={120} height={120}>
      <ShiftBattery />
    </ShiftPartFrame>
  ),
}
