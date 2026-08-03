/**
 * Shift's own reading of connectivity, independent of how a host measures it.
 *
 * Shift renders a reading; it never queries a device. A host that has no real
 * network facts omits the reading entirely rather than passing a plausible
 * default, and the status bar draws nothing.
 */
export type ShiftNetworkReading =
  | { readonly _tag: "Unknown" }
  | { readonly _tag: "Disconnected" }
  | {
      readonly _tag: "Connected"
      readonly name: string | null
      readonly strengthPercent: number | null
    }

export const UNKNOWN_SHIFT_NETWORK_READING: ShiftNetworkReading = {
  _tag: "Unknown",
}

/** Fixtures and previews start connected; production passes a real reading. */
export const DEFAULT_SHIFT_NETWORK_READING: ShiftNetworkReading = {
  _tag: "Connected",
  name: "Wi-Fi",
  strengthPercent: 82,
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
