/**
 * Shift's own reading of battery state, independent of how a host measures it.
 *
 * A host with no battery facts passes nothing and the indicator disappears —
 * Shift does not draw a plausible battery for a device it cannot read.
 */
import type { ShiftBatteryProps } from "./ui/atoms/ShiftBattery"

export interface ShiftPowerReading {
  readonly percent: number
  readonly charging: boolean
}

export function shiftBatteryPropsForPowerReading(
  reading: ShiftPowerReading | undefined,
  options: { readonly showPercent?: boolean } = {},
): ShiftBatteryProps | undefined {
  if (!reading) return undefined
  return {
    level: batteryLevelForPercent(reading.percent),
    charging: reading.charging,
    ...(options.showPercent ? { percent: reading.percent } : {}),
  }
}

export function shiftPowerDisplayLabel(reading: ShiftPowerReading): string {
  return `${reading.percent}%${reading.charging ? ", charging" : ""}`
}

function batteryLevelForPercent(
  percent: number,
): NonNullable<ShiftBatteryProps["level"]> {
  if (percent >= 75) return "full"
  if (percent <= 20) return "low"
  return "medium"
}
