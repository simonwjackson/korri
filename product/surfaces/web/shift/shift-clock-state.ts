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

/**
 * Encode a real instant as the Shift clock's display value. The status-bar
 * label reads UTC accessors (see `shiftClockLabelForIso`), and the presets
 * follow the same convention: they carry the intended *displayed* wall-clock in
 * the ISO's UTC fields (e.g. `16:24Z` renders "4:24 PM"). A live reading must
 * match, so we shift the instant by the local timezone offset — the resulting
 * ISO's UTC hours/minutes equal the device's local wall-clock, and the single
 * UTC formatting path keeps rendering the right time.
 */
export function shiftClockIsoForInstant(
  now: Date,
  offsetMinutes: number = now.getTimezoneOffset(),
): ShiftClockIso {
  return new Date(now.getTime() - offsetMinutes * 60_000).toISOString()
}

export function shiftClockLabelForIso(value: string | undefined): string {
  const date = new Date(shiftClockIsoForValue(value))
  const hour = date.getUTCHours()
  const minute = date.getUTCMinutes().toString().padStart(2, "0")
  const hour12 = hour % 12 || 12
  const suffix = hour < 12 ? "AM" : "PM"
  return `${hour12}:${minute} ${suffix}`
}
