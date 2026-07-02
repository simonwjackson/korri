import * as Atom from "effect/unstable/reactivity/Atom"

/**
 * Pico's network state: the connectivity reading the status-bar wifi glyph
 * consumes. Mirrors shift-network-state.ts; the lab drives the atom via an
 * event so the glyph reflects a real reading rather than a hand-set flag.
 */

export type PicoNetworkReading =
  | { readonly _tag: "Disconnected" }
  | { readonly _tag: "Connected"; readonly strengthPercent: number }

const DEFAULT_PICO_NETWORK_STRENGTH_PERCENT = 82

export const DEFAULT_PICO_NETWORK_READING: PicoNetworkReading = {
  _tag: "Connected",
  strengthPercent: DEFAULT_PICO_NETWORK_STRENGTH_PERCENT,
}

export const picoNetworkReadingAtom = Atom.make<PicoNetworkReading>(
  DEFAULT_PICO_NETWORK_READING,
)

export function picoNetworkReadingForValue(value: unknown): PicoNetworkReading {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_PICO_NETWORK_READING
  }
  const record = value as Record<string, unknown>
  if (record._tag === "Disconnected") return { _tag: "Disconnected" }
  if (record._tag === "Connected") {
    return {
      _tag: "Connected",
      strengthPercent: normalizePercent(
        record.strengthPercent,
        DEFAULT_PICO_NETWORK_STRENGTH_PERCENT,
      ),
    }
  }
  return DEFAULT_PICO_NETWORK_READING
}

export function picoNetworkConnected(reading: PicoNetworkReading): boolean {
  return reading._tag === "Connected"
}

export function picoNetworkDisplayLabel(reading: PicoNetworkReading): string {
  return reading._tag === "Disconnected"
    ? "Disconnected"
    : `Wi-Fi ${reading.strengthPercent}%`
}

function normalizePercent(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}
