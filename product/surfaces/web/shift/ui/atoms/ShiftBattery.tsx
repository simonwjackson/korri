/**
 * Shift Battery — the status-bar power indicator as a standalone atom.
 *
 * Its own state (charge level / charging) is independent of the page around it:
 * the Home can be loading, ready, or erroring while the battery is full, low, or
 * charging. Extracting it makes that independence representable — the atom is
 * driven by `level`/`charging`, not by whatever screen contains it.
 */
import {
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
} from "lucide-react"

export type ShiftBatteryLevel = "full" | "medium" | "low"

export interface ShiftBatteryProps {
  readonly level?: ShiftBatteryLevel
  readonly charging?: boolean
}

const LEVEL_ICON = {
  full: BatteryFull,
  medium: BatteryMedium,
  low: BatteryLow,
} as const

export function ShiftBattery({
  level = "medium",
  charging = false,
}: ShiftBatteryProps) {
  const Icon = charging ? BatteryCharging : LEVEL_ICON[level]
  return <Icon className="shift-cine-status-icon" aria-hidden />
}
