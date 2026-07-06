/**
 * Shift Status Bar — the Home's top chrome (clock, connectivity, battery) as a
 * standalone molecule. It composes the real `ShiftBattery` atom, so
 * the battery's state flows through it: the same component the Home renders is
 * the one the dev-lab can drive in isolation.
 */
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import {
  DEFAULT_SHIFT_NETWORK_READING,
  type ShiftNetworkReading,
} from "../../shift-network-state"
import { ShiftBattery, type ShiftBatteryProps } from "../atoms/ShiftBattery"
import { ShiftClock } from "../atoms/ShiftClock"
import { ShiftNetworkIcon } from "../atoms/ShiftNetworkIcon"

export interface ShiftStatusBarProps {
  readonly time?: string
  readonly network?: ShiftNetworkReading
  /** Battery state for the indicator; omit when no live battery is available. */
  readonly battery?: ShiftBatteryProps
}

export function ShiftStatusBar({
  time = "4:24 PM",
  network = DEFAULT_SHIFT_NETWORK_READING,
  battery,
}: ShiftStatusBarProps) {
  return (
    <header
      className="shift-cine-top"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.statusBar)}
    >
      <ShiftClock time={time} />
      <span className="shift-cine-status">
        <ShiftNetworkIcon network={network} />
        {battery ? <ShiftBattery {...battery} /> : null}
      </span>
    </header>
  )
}
