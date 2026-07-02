import type { DeviceState } from "@platform/device/device-facts"
import * as Atom from "effect/unstable/reactivity/Atom"

/**
 * Pico's power state: the canonical pico power-reading <-> Korrid device-state
 * conversion + the status-bar display derivation. Production feeds
 * `deviceStateAtom` from the device-state event stream; the lab drives the same
 * atom via events. The status bar consumes the derived display, never a
 * hand-set percent — the same shape Shift uses (shift-power-state.ts).
 */

export type PicoPowerReading = {
  readonly percent: number
  readonly charging: boolean
}

export type PicoPowerDisplay =
  | { readonly _tag: "Hidden" }
  | { readonly _tag: "Unknown" }
  | {
      readonly _tag: "Ready"
      readonly percent: number
      readonly charging: boolean
    }
  | {
      readonly _tag: "Stale"
      readonly percent: number
      readonly charging: boolean
    }

export const DEFAULT_PICO_POWER_READING: PicoPowerReading = {
  percent: 82,
  charging: false,
}

export const picoPowerReadingAtom = Atom.make<PicoPowerReading>(
  DEFAULT_PICO_POWER_READING,
)

export function picoPowerReadingForValue(value: unknown): PicoPowerReading {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_PICO_POWER_READING
  }
  const record = value as Record<string, unknown>
  return {
    percent: normalizePercent(
      record.percent,
      DEFAULT_PICO_POWER_READING.percent,
    ),
    charging:
      typeof record.charging === "boolean"
        ? record.charging
        : DEFAULT_PICO_POWER_READING.charging,
  }
}

/**
 * Canonical pico power-reading -> Korrid device-state conversion. Previews, lab
 * events, and seeds share this one mapping so the battery shape never drifts.
 */
export function picoDeviceStateForPowerReading(
  reading: PicoPowerReading,
  observedAt: string = new Date().toISOString(),
): DeviceState {
  return {
    observedAt,
    battery: {
      _tag: "Ready",
      percent: reading.percent,
      status: reading.charging ? "Charging" : "Discharging",
      charging: reading.charging,
      supplies: [],
      observedAt,
    },
  }
}

export function picoPowerDisplayForDeviceState(
  state: DeviceState,
): PicoPowerDisplay {
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

export function picoPowerDisplayLabel(reading: PicoPowerReading): string {
  return `${reading.percent}%${reading.charging ? ", charging" : ""}`
}

function readyDisplay(
  percent: number | null,
  charging: boolean,
  tag: "Ready" | "Stale" = "Ready",
): PicoPowerDisplay {
  if (percent === null) return { _tag: "Unknown" }
  return { _tag: tag, percent, charging }
}

function normalizePercent(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}
