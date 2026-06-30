import * as Atom from "effect/unstable/reactivity/Atom"

export const DEFAULT_SHIFT_CLOCK_ISO = "2026-06-30T16:24:00.000Z"

export const SHIFT_CLOCK_PRESETS = [
  {
    id: "2026-06-30T09:41:00.000Z",
    label: "9:41 AM",
  },
  {
    id: DEFAULT_SHIFT_CLOCK_ISO,
    label: "4:24 PM",
  },
  {
    id: "2026-06-30T23:08:00.000Z",
    label: "11:08 PM",
  },
] as const

export type ShiftClockIso = string

export const shiftClockIsoAtom = Atom.make(
  DEFAULT_SHIFT_CLOCK_ISO as ShiftClockIso,
)

export function shiftClockIsoForValue(
  value: string | undefined,
): ShiftClockIso {
  if (!value) return DEFAULT_SHIFT_CLOCK_ISO
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? DEFAULT_SHIFT_CLOCK_ISO
    : date.toISOString()
}

export function shiftClockLabelForIso(value: string | undefined): string {
  const date = new Date(shiftClockIsoForValue(value))
  const hour = date.getUTCHours()
  const minute = date.getUTCMinutes().toString().padStart(2, "0")
  const hour12 = hour % 12 || 12
  const suffix = hour < 12 ? "AM" : "PM"
  return `${hour12}:${minute} ${suffix}`
}
