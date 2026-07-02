import * as Atom from "effect/unstable/reactivity/Atom"

/**
 * Pico's clock state: the ISO instant the status-bar clock renders, plus the
 * pico 24-hour `H:MM` label derivation. Mirrors shift-clock-state.ts; the lab
 * pins/holds this atom as a live input so the clock is a real reading.
 */

export type PicoClockIso = string

// Default renders "10:24" (the value the status bar historically hard-coded).
export const DEFAULT_PICO_CLOCK_ISO = "2026-06-30T10:24:00.000Z"

export const PICO_CLOCK_PRESETS = [
  { id: "2026-06-30T09:41:00.000Z", label: "9:41" },
  { id: DEFAULT_PICO_CLOCK_ISO, label: "10:24" },
  { id: "2026-06-30T23:08:00.000Z", label: "23:08" },
] as const

export const picoClockIsoAtom = Atom.make(
  DEFAULT_PICO_CLOCK_ISO as PicoClockIso,
)

export function picoClockIsoForValue(value: string | undefined): PicoClockIso {
  if (!value) return DEFAULT_PICO_CLOCK_ISO
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? DEFAULT_PICO_CLOCK_ISO
    : date.toISOString()
}

/** Pico renders a compact 24-hour `H:MM` clock (e.g. "10:24", "23:08"). */
export function picoClockLabelForIso(value: string | undefined): string {
  const date = new Date(picoClockIsoForValue(value))
  const hour = date.getUTCHours()
  const minute = date.getUTCMinutes().toString().padStart(2, "0")
  return `${hour}:${minute}`
}
