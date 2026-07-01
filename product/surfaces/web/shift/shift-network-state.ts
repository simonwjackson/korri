import * as Atom from "effect/unstable/reactivity/Atom"

export type ShiftNetworkReading =
  | { readonly _tag: "Disconnected" }
  | { readonly _tag: "Connected"; readonly strengthPercent: number }

const DEFAULT_SHIFT_NETWORK_STRENGTH_PERCENT = 82

export const DEFAULT_SHIFT_NETWORK_READING: ShiftNetworkReading = {
  _tag: "Connected",
  strengthPercent: DEFAULT_SHIFT_NETWORK_STRENGTH_PERCENT,
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
  if (record._tag === "Disconnected") return { _tag: "Disconnected" }
  if (record._tag === "Connected") {
    return {
      _tag: "Connected",
      strengthPercent: normalizePercent(
        record.strengthPercent,
        DEFAULT_SHIFT_NETWORK_STRENGTH_PERCENT,
      ),
    }
  }
  return DEFAULT_SHIFT_NETWORK_READING
}

export function shiftNetworkDisplayLabel(reading: ShiftNetworkReading): string {
  return reading._tag === "Disconnected"
    ? "Disconnected"
    : `${networkStrengthLabel(reading.strengthPercent)} Wi-Fi (${reading.strengthPercent}%)`
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
