import * as Atom from "effect/unstable/reactivity/Atom"
import type { ShiftBatteryProps } from "./ui/atoms/ShiftBattery"

export type ShiftPowerReading = {
  readonly percent: number
  readonly charging: boolean
}

export const DEFAULT_SHIFT_POWER_READING: ShiftPowerReading = {
  percent: 64,
  charging: false,
}

export const shiftPowerReadingAtom = Atom.make<ShiftPowerReading>(
  DEFAULT_SHIFT_POWER_READING,
)

export function shiftPowerReadingForValue(value: unknown): ShiftPowerReading {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_SHIFT_POWER_READING
  }
  const record = value as Record<string, unknown>
  return {
    percent: normalizePercent(
      record.percent,
      DEFAULT_SHIFT_POWER_READING.percent,
    ),
    charging:
      typeof record.charging === "boolean"
        ? record.charging
        : DEFAULT_SHIFT_POWER_READING.charging,
  }
}

export function shiftBatteryPropsForPowerReading(
  reading: ShiftPowerReading | unknown,
): ShiftBatteryProps {
  const power = shiftPowerReadingForValue(reading)
  return {
    level: batteryLevelForPercent(power.percent),
    charging: power.charging,
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

function normalizePercent(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}
