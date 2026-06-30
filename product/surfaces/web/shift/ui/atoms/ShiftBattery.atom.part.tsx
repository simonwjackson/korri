/**
 * Battery atom catalog entry — a state family (Full / Medium / Low / Charging).
 *
 * This is the concrete "a child has its own state" example: the battery's states
 * are independent of any page. The dev-lab discovers the array as a linked
 * variant family (each item carries a `state`), so the States control switches
 * between charge levels while the part renders in isolation.
 */

import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftBattery } from "./ShiftBattery"

const note = "Power"

export const ShiftBatteryStates = [
  {
    name: "Battery",
    note,
    state: "Full",
    render: () => (
      <ShiftPartFrame width={120} height={120}>
        <ShiftBattery level="full" />
      </ShiftPartFrame>
    ),
  },
  {
    name: "Battery",
    note,
    state: "Medium",
    render: () => (
      <ShiftPartFrame width={120} height={120}>
        <ShiftBattery level="medium" />
      </ShiftPartFrame>
    ),
  },
  {
    name: "Battery",
    note,
    state: "Low",
    render: () => (
      <ShiftPartFrame width={120} height={120}>
        <ShiftBattery level="low" />
      </ShiftPartFrame>
    ),
  },
  {
    name: "Battery",
    note,
    state: "Charging",
    render: () => (
      <ShiftPartFrame width={120} height={120}>
        <ShiftBattery charging />
      </ShiftPartFrame>
    ),
  },
]
