import * as Atom from "effect/unstable/reactivity/Atom"
import type { ShiftBatteryProps } from "./ui/atoms/ShiftBattery"

export const SHIFT_POWER_STATE_TAGS = [
  "Full",
  "Medium",
  "Low",
  "Charging",
] as const

export type ShiftPowerState = (typeof SHIFT_POWER_STATE_TAGS)[number]

export const DEFAULT_SHIFT_POWER_STATE = "Medium" satisfies ShiftPowerState

export const shiftPowerStateAtom = Atom.make(
  DEFAULT_SHIFT_POWER_STATE as ShiftPowerState,
)

export function shiftBatteryPropsForPowerState(
  state: ShiftPowerState | string | undefined,
): ShiftBatteryProps {
  switch (state) {
    case "Full":
      return { level: "full" }
    case "Low":
      return { level: "low" }
    case "Charging":
      return { charging: true }
    default:
      return { level: "medium" }
  }
}
