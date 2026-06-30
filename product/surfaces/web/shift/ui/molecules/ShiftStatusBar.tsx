/**
 * Shift Status Bar — the Home's top chrome (clock, connectivity, battery,
 * avatar) as a standalone molecule. It composes the real `ShiftBattery` atom, so
 * the battery's state flows through it: the same component the Home renders is
 * the one the dev-lab can drive in isolation.
 */
import { Wifi } from "lucide-react"
import { ShiftBattery, type ShiftBatteryProps } from "../atoms/ShiftBattery"

export interface ShiftStatusBarProps {
  readonly time?: string
  readonly avatarSrc?: string
  /** Battery state for the indicator; defaults to a mid-charge battery. */
  readonly battery?: ShiftBatteryProps
}

export function ShiftStatusBar({
  time = "4:24 PM",
  avatarSrc,
  battery,
}: ShiftStatusBarProps) {
  return (
    <header className="shift-cine-top">
      <span className="shift-cine-clock">{time}</span>
      <span className="shift-cine-status">
        <Wifi className="shift-cine-status-icon" aria-hidden />
        <ShiftBattery {...battery} />
        {avatarSrc ? (
          <img className="shift-cine-avatar" src={avatarSrc} alt="" />
        ) : null}
      </span>
    </header>
  )
}
