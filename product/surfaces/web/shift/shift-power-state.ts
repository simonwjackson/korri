import type { DeviceState } from "@platform/device/device-facts"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { ShiftBatteryProps } from "./ui/atoms/ShiftBattery"

export type ShiftPowerReading = {
  readonly percent: number
  readonly charging: boolean
}

export type ShiftPowerDisplay =
  | { readonly _tag: "Hidden" }
  | { readonly _tag: "Unknown" }
  | { readonly _tag: "Ready"; readonly percent: number; readonly charging: boolean }
  | { readonly _tag: "Stale"; readonly percent: number; readonly charging: boolean }

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

export function shiftPowerDisplayForDeviceState(
  state: DeviceState,
): ShiftPowerDisplay {
  const battery = state.battery
  switch (battery._tag) {
    case "Ready":
      return readyDisplay(battery.percent, battery.charging)
    case "Stale":
      return readyDisplay(
        battery.lastKnown.percent,
        battery.lastKnown.charging,
        "Stale",
      )
    case "NoBattery":
      return { _tag: "Hidden" }
    case "Unknown":
    case "ReadError":
      return { _tag: "Unknown" }
  }
}

export function shiftBatteryPropsForPowerDisplay(
  display: ShiftPowerDisplay,
): ShiftBatteryProps | undefined {
  if (display._tag !== "Ready") return undefined
  return {
    level: batteryLevelForPercent(display.percent),
    charging: display.charging,
  }
}

export function shiftPowerDisplayLabel(reading: ShiftPowerReading): string {
  return `${reading.percent}%${reading.charging ? ", charging" : ""}`
}

function readyDisplay(
  percent: number | null,
  charging: boolean,
  tag: "Ready" | "Stale" = "Ready",
): ShiftPowerDisplay {
  if (percent === null) return { _tag: "Unknown" }
  return { _tag: tag, percent, charging }
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
