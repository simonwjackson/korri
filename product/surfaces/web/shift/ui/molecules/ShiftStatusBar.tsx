/**
 * Shift Status Bar — the Home's top chrome (clock, connectivity, battery,
 * avatar) as a standalone molecule. It composes the real `ShiftBattery` atom, so
 * the battery's state flows through it: the same component the Home renders is
 * the one the dev-lab can drive in isolation.
 */
import { Wifi, WifiOff } from "lucide-react"
import {
  DEFAULT_SHIFT_NETWORK_READING,
  type ShiftNetworkReading,
  shiftNetworkConnected,
} from "../../shift-network-state"
import { ShiftBattery, type ShiftBatteryProps } from "../atoms/ShiftBattery"

export interface ShiftStatusBarProps {
  readonly time?: string
  readonly avatarSrc?: string
  readonly network?: ShiftNetworkReading
  /** Battery state for the indicator; defaults to a mid-charge battery. */
  readonly battery?: ShiftBatteryProps
}

export function ShiftStatusBar({
  time = "4:24 PM",
  avatarSrc,
  network = DEFAULT_SHIFT_NETWORK_READING,
  battery,
}: ShiftStatusBarProps) {
  const NetworkIcon = shiftNetworkConnected(network) ? Wifi : WifiOff
  return (
    <header className="shift-cine-top">
      <span className="shift-cine-clock">{time}</span>
      <span className="shift-cine-status">
        <NetworkIcon className="shift-cine-status-icon" aria-hidden />
        <ShiftBattery {...battery} />
        {avatarSrc ? (
          <img className="shift-cine-avatar" src={avatarSrc} alt="" />
        ) : null}
      </span>
    </header>
  )
}
