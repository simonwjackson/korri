export interface StreamHealthSample {
  readonly seq: number
  readonly sampledAtMs: number
  readonly rttMs?: number
  readonly rttVarianceMs?: number
  readonly lossFraction?: number
  readonly deliveredBitrateKbps?: number
  readonly requestedBitrateKbps?: number
  readonly deliveredFps?: number
  readonly requestedFps?: number
  readonly framesDropped?: number
  readonly decodeTimeMs?: number
  readonly queueDepth?: number
  readonly firstFrameMs?: number
}

export type StreamHealthFreshness = "fresh" | "stale" | "no-data"
export type StreamHealthTrend = "rising" | "falling" | "flat" | "unknown"

export interface StreamHealthWindowOptions {
  readonly maxSamples?: number
  readonly staleAfterMs?: number
}

export interface StreamHealthWindow {
  readonly samples: readonly StreamHealthSample[]
  readonly maxSamples: number
  readonly staleAfterMs: number
}

export interface NumericSummary {
  readonly mean?: number
  readonly variance?: number
  readonly trend: StreamHealthTrend
}

export interface CounterDeltaSummary {
  readonly delta?: number
}

export interface StreamHealthSummary {
  readonly freshness: StreamHealthFreshness
  readonly sampleCount: number
  readonly lastSampleAtMs?: number
  readonly rttMs: NumericSummary
  readonly rttVarianceMs: NumericSummary
  readonly lossFraction: NumericSummary
  readonly decodeTimeMs: NumericSummary
  readonly queueDepth: NumericSummary
  readonly firstFrameMs: NumericSummary
  readonly bitrateDeliveryRatio?: number
  readonly fpsDeliveryRatio?: number
  readonly framesDropped: CounterDeltaSummary
}

const DEFAULT_MAX_SAMPLES = 30
const DEFAULT_STALE_AFTER_MS = 3_000

export function createStreamHealthWindow(
  options: StreamHealthWindowOptions = {},
): StreamHealthWindow {
  return {
    samples: [],
    maxSamples: Math.max(1, options.maxSamples ?? DEFAULT_MAX_SAMPLES),
    staleAfterMs: Math.max(0, options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS),
  }
}

export function ingestStreamHealthSample(
  window: StreamHealthWindow,
  sample: StreamHealthSample,
): StreamHealthWindow {
  const samples = [...window.samples, sample].slice(-window.maxSamples)
  return { ...window, samples }
}

export function summarizeStreamHealth(
  window: StreamHealthWindow,
  nowMs: number,
): StreamHealthSummary {
  const last = window.samples.at(-1)
  const freshness = freshnessOf(window, nowMs)
  return {
    freshness,
    sampleCount: window.samples.length,
    lastSampleAtMs: last?.sampledAtMs,
    rttMs: summarizeNumeric(window.samples, sample => sample.rttMs),
    rttVarianceMs: summarizeNumeric(
      window.samples,
      sample => sample.rttVarianceMs,
    ),
    lossFraction: summarizeNumeric(
      window.samples,
      sample => sample.lossFraction,
    ),
    decodeTimeMs: summarizeNumeric(
      window.samples,
      sample => sample.decodeTimeMs,
    ),
    queueDepth: summarizeNumeric(window.samples, sample => sample.queueDepth),
    firstFrameMs: summarizeNumeric(
      window.samples,
      sample => sample.firstFrameMs,
    ),
    bitrateDeliveryRatio: meanRatio(
      window.samples,
      sample => sample.deliveredBitrateKbps,
      sample => sample.requestedBitrateKbps,
    ),
    fpsDeliveryRatio: meanRatio(
      window.samples,
      sample => sample.deliveredFps,
      sample => sample.requestedFps,
    ),
    framesDropped: summarizeCounterDelta(
      window.samples,
      sample => sample.framesDropped,
    ),
  }
}

function freshnessOf(
  window: StreamHealthWindow,
  nowMs: number,
): StreamHealthFreshness {
  const last = window.samples.at(-1)
  if (!last) return "no-data"
  return nowMs - last.sampledAtMs > window.staleAfterMs ? "stale" : "fresh"
}

function summarizeNumeric(
  samples: readonly StreamHealthSample[],
  pick: (sample: StreamHealthSample) => number | undefined,
): NumericSummary {
  const values = samples.map(pick).filter(isNumber)
  if (values.length === 0) return { trend: "unknown" }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return { mean, variance, trend: trendOf(values) }
}

function meanRatio(
  samples: readonly StreamHealthSample[],
  numerator: (sample: StreamHealthSample) => number | undefined,
  denominator: (sample: StreamHealthSample) => number | undefined,
): number | undefined {
  const ratios = samples
    .map(sample => {
      const n = numerator(sample)
      const d = denominator(sample)
      return n !== undefined && d !== undefined && d > 0 ? n / d : undefined
    })
    .filter(isNumber)
  if (ratios.length === 0) return undefined
  return ratios.reduce((sum, value) => sum + value, 0) / ratios.length
}

function summarizeCounterDelta(
  samples: readonly StreamHealthSample[],
  pick: (sample: StreamHealthSample) => number | undefined,
): CounterDeltaSummary {
  const values = samples.map(pick).filter(isNumber)
  if (values.length < 2) return {}
  return { delta: Math.max(0, values.at(-1)! - values[0]!) }
}

function trendOf(values: readonly number[]): StreamHealthTrend {
  if (values.length < 2) return "unknown"
  const delta = values.at(-1)! - values[0]!
  if (Math.abs(delta) < 0.000_001) return "flat"
  return delta > 0 ? "rising" : "falling"
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
