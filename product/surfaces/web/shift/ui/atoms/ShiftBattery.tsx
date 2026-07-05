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
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"

export type ShiftBatteryLevel = "full" | "medium" | "low"

export interface ShiftBatteryProps {
  readonly level?: ShiftBatteryLevel
  readonly charging?: boolean
  /** Optional numeric status label; omit to keep the compact icon-only form. */
  readonly percent?: number
}

const LEVEL_ICON = {
  full: BatteryFull,
  medium: BatteryMedium,
  low: BatteryLow,
} as const

export function ShiftBattery({
  level = "medium",
  charging = false,
  percent,
}: ShiftBatteryProps) {
  const Icon = charging ? BatteryCharging : LEVEL_ICON[level]
  const label = batteryLabel({ level, charging, percent })

  return (
    <span
      className="shift-cine-battery"
      aria-label={label}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.battery)}
    >
      <Icon className="shift-cine-status-icon" aria-hidden />
      {percent !== undefined ? (
        <span className="shift-cine-battery-percent">{percent}%</span>
      ) : null}
    </span>
  )
}

function batteryLabel({
  level,
  charging,
  percent,
}: Required<Pick<ShiftBatteryProps, "level" | "charging">> & {
  readonly percent?: number
}): string {
  const prefix = percent === undefined ? `Battery ${level}` : `Battery ${percent}%`
  return charging ? `${prefix}, charging` : prefix
}
