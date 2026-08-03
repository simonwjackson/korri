/**
 * Shift Status Bar — the Home's top chrome (clock, connectivity, battery) as a
 * standalone molecule. It composes the real `ShiftBattery` atom, so
 * the battery's state flows through it: the same component the Home renders is
 * the one a fixture can drive in isolation.
 *
 * Every reading is optional and nothing is defaulted: a host that cannot read
 * the clock, the network, or the battery shows no indicator rather than a
 * plausible-looking invention.
 */
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import type { ShiftNetworkReading } from "../../shift-network-state"
import { ShiftBattery, type ShiftBatteryProps } from "../atoms/ShiftBattery"
import { ShiftClock } from "../atoms/ShiftClock"
import { ShiftNetworkIcon } from "../atoms/ShiftNetworkIcon"

export interface ShiftStatusBarProps {
  readonly time?: string
  readonly network?: ShiftNetworkReading
  /** Battery state for the indicator; omit when no live battery is available. */
  readonly battery?: ShiftBatteryProps
}

export function ShiftStatusBar({ time, network, battery }: ShiftStatusBarProps) {
  return (
    <header
      className="shift-cine-top"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.statusBar)}
    >
      {time ? <ShiftClock time={time} /> : <span />}
      <span className="shift-cine-status">
        {network ? <ShiftNetworkIcon network={network} /> : null}
        {battery ? <ShiftBattery {...battery} /> : null}
      </span>
    </header>
  )
}
