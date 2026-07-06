import type { StreamAdaptivePressure } from "./stream-adaptive-controller"

export interface StreamHandoffSignal {
  readonly signalPercent?: number
  readonly handoffInProgress?: boolean
}

export interface StreamHandoffHint {
  readonly kind: "collapse-likely"
  readonly severity: number
}

export function normalizeHandoffTrigger(
  signal?: StreamHandoffSignal,
): StreamHandoffHint | undefined {
  if (!signal) return undefined
  if (signal.handoffInProgress) return { kind: "collapse-likely", severity: 1 }
  if (signal.signalPercent === undefined || signal.signalPercent >= 30) return undefined
  const severity = Math.round(clamp01((30 - signal.signalPercent) / 21) * 10) / 10
  return { kind: "collapse-likely", severity }
}

export function handoffHintPressure(hint: StreamHandoffHint): StreamAdaptivePressure {
  const pressure = clamp01(hint.severity * 0.5)
  return { bandwidth: pressure, latency: pressure, decode: 0 }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
