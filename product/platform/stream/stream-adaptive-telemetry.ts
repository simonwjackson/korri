import type { StreamBoundaries } from "./stream-adaptive-boundaries"
import type { StreamAdaptiveDecision } from "./stream-adaptive-controller"
import type { StreamHealthSummary } from "./stream-health"

export interface StreamAdaptiveTelemetryEntry {
  readonly tMs: number
  readonly summary: Partial<StreamHealthSummary>
  readonly decision: StreamAdaptiveDecision
  readonly boundaries?: StreamBoundaries
}

export interface StreamAdaptiveTelemetryRecorderOptions {
  readonly enabled?: boolean
  readonly maxEntries?: number
}

export interface StreamAdaptiveTelemetryRecorder {
  readonly record: (entry: StreamAdaptiveTelemetryEntry) => void
  readonly entries: () => readonly StreamAdaptiveTelemetryEntry[]
  readonly exportJsonl: () => string
  readonly clear: () => void
}

const DEFAULT_MAX_ENTRIES = 1_000

export function createStreamAdaptiveTelemetryRecorder(
  options: StreamAdaptiveTelemetryRecorderOptions = {},
): StreamAdaptiveTelemetryRecorder {
  const enabled = options.enabled ?? true
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES)
  let buffer: StreamAdaptiveTelemetryEntry[] = []

  return {
    record: entry => {
      if (!enabled) return
      buffer = [...buffer, entry].slice(-maxEntries)
    },
    entries: () => buffer,
    exportJsonl: () => buffer.map(entry => JSON.stringify(entry)).join("\n"),
    clear: () => {
      buffer = []
    },
  }
}

export function parseStreamAdaptiveTrace(
  jsonl: string,
): readonly StreamAdaptiveTelemetryEntry[] {
  return jsonl
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line) as StreamAdaptiveTelemetryEntry)
}
