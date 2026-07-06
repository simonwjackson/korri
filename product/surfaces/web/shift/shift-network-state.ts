import type {
  DeviceNetworkState,
  DeviceState,
} from "@platform/device/device-facts"
import * as Atom from "effect/unstable/reactivity/Atom"

export type ShiftNetworkReading =
  | { readonly _tag: "Unknown" }
  | { readonly _tag: "Disconnected" }
  | {
      readonly _tag: "Connected"
      readonly name: string | null
      readonly strengthPercent: number | null
    }

const DEFAULT_SHIFT_NETWORK_STRENGTH_PERCENT = 82

export const DEFAULT_SHIFT_NETWORK_READING: ShiftNetworkReading = {
  _tag: "Connected",
  name: "Wi-Fi",
  strengthPercent: DEFAULT_SHIFT_NETWORK_STRENGTH_PERCENT,
}

export const UNKNOWN_SHIFT_NETWORK_READING: ShiftNetworkReading = {
  _tag: "Unknown",
}

export const shiftNetworkReadingAtom = Atom.make<ShiftNetworkReading>(
  DEFAULT_SHIFT_NETWORK_READING,
)

export function shiftNetworkReadingForValue(
  value: unknown,
): ShiftNetworkReading {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_SHIFT_NETWORK_READING
  }
  const record = value as Record<string, unknown>
  if (record._tag === "Unknown") return UNKNOWN_SHIFT_NETWORK_READING
  if (record._tag === "Disconnected") return { _tag: "Disconnected" }
  if (record._tag === "Connected") {
    return {
      _tag: "Connected",
      name: normalizeName(record.name),
      strengthPercent:
        record.strengthPercent === null
          ? null
          : normalizePercent(
              record.strengthPercent,
              DEFAULT_SHIFT_NETWORK_STRENGTH_PERCENT,
            ),
    }
  }
  return DEFAULT_SHIFT_NETWORK_READING
}

export function shiftDeviceNetworkStateForNetworkReading(
  reading: ShiftNetworkReading,
  observedAt = new Date().toISOString(),
): DeviceNetworkState {
  switch (reading._tag) {
    case "Connected":
      return {
        _tag: "Connected",
        kind: "wifi",
        name: reading.name,
        strengthPercent: reading.strengthPercent,
        observedAt,
      }
    case "Disconnected":
      return { _tag: "Disconnected", observedAt }
    case "Unknown":
      return { _tag: "Unknown", observedAt }
  }
}

export function shiftNetworkReadingForDeviceState(
  state: DeviceState,
): ShiftNetworkReading {
  switch (state.network._tag) {
    case "Connected":
      if (state.network.kind !== "wifi") return UNKNOWN_SHIFT_NETWORK_READING
      return {
        _tag: "Connected",
        name: state.network.name,
        strengthPercent: state.network.strengthPercent,
      }
    case "Disconnected":
      return { _tag: "Disconnected" }
    case "Unknown":
    case "ReadError":
    case "Stale":
      return UNKNOWN_SHIFT_NETWORK_READING
  }
}

export function shiftNetworkDisplayLabel(reading: ShiftNetworkReading): string {
  switch (reading._tag) {
    case "Unknown":
      return "Network unknown"
    case "Disconnected":
      return "Disconnected"
    case "Connected": {
      const name = shiftNetworkDisplayName(reading)
      return reading.strengthPercent === null
        ? name
        : `${name} · ${networkStrengthLabel(reading.strengthPercent)} Wi-Fi (${reading.strengthPercent}%)`
    }
  }
}

export function shiftNetworkDisplayName(reading: ShiftNetworkReading): string {
  return reading._tag === "Connected" ? (reading.name ?? "Wi-Fi") : ""
}

export function shiftNetworkConnected(reading: ShiftNetworkReading): boolean {
  return reading._tag === "Connected"
}

export function networkStrengthLabel(
  percent: number,
): "Weak" | "Good" | "Strong" {
  if (percent <= 33) return "Weak"
  if (percent <= 66) return "Good"
  return "Strong"
}

function normalizePercent(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
