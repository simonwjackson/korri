import type { StreamHealthSummary } from "./stream-health"

export interface StreamAdaptiveResolution {
  readonly width: number
  readonly height: number
}

export interface StreamAdaptiveSettings {
  readonly bitrateKbps: number
  readonly fps: number
  readonly resolution: StreamAdaptiveResolution
  /** Confirmed baseline stream geometry; all adaptive resolution targets scale this aspect. */
  readonly baselineResolution: StreamAdaptiveResolution
}

export interface StreamAdaptiveControllerParams {
  readonly minBitrateKbps?: number
  readonly maxBitrateKbps?: number
  readonly maxFps?: number
  readonly bitrateDeadbandFraction?: number
  readonly fpsDeadband?: number
  readonly resolutionDeadbandFraction?: number
  readonly bitrateIncreaseFraction?: number
}

export interface StreamAdaptiveControllerInput {
  readonly summary: StreamHealthSummary
  readonly current: StreamAdaptiveSettings
  /** 0 = latency-biased, 1 = quality-biased. */
  readonly objectiveBias: number
  readonly params?: StreamAdaptiveControllerParams
}

export interface StreamAdaptiveTarget {
  readonly bitrateKbps?: number
  readonly fps?: number
  readonly resolution?: StreamAdaptiveResolution
}

export type StreamAdaptiveDormantReason =
  | "stale"
  | "no-data"
  | "within-hysteresis"

export type StreamAdaptiveDecision =
  | { readonly kind: "dormant"; readonly reason: StreamAdaptiveDormantReason }
  | {
      readonly kind: "target"
      readonly target: StreamAdaptiveTarget
      readonly pressure: StreamAdaptivePressure
    }

export interface StreamAdaptivePressure {
  readonly bandwidth: number
  readonly latency: number
  readonly decode: number
}

const DEFAULTS = {
  minBitrateKbps: 500,
  maxBitrateKbps: 150_000,
  maxFps: 120,
  bitrateDeadbandFraction: 0.05,
  fpsDeadband: 5,
  resolutionDeadbandFraction: 0.08,
  bitrateIncreaseFraction: 0.1,
}

const FPS_STEPS = [15, 30, 40, 45, 60, 75, 90, 100, 120, 144, 240]

export function computeStreamAdaptiveDecision(
  input: StreamAdaptiveControllerInput,
): StreamAdaptiveDecision {
  const { summary, current } = input
  if (summary.freshness === "no-data") {
    return { kind: "dormant", reason: "no-data" }
  }
  if (summary.freshness === "stale") {
    return { kind: "dormant", reason: "stale" }
  }

  const params = { ...DEFAULTS, ...(input.params ?? {}) }
  const objectiveBias = clamp(input.objectiveBias, 0, 1)
  const pressure = computePressure(summary)
  const target: StreamAdaptiveTarget = {}

  const stressed =
    pressure.bandwidth > 0.12 ||
    pressure.latency > 0.35 ||
    pressure.decode > 0.35
  const healthy =
    pressure.bandwidth < 0.02 && pressure.latency < 0.1 && pressure.decode < 0.1

  if (pressure.bandwidth > 0.1) {
    const reduction = clamp(
      pressure.bandwidth * (0.45 - objectiveBias * 0.15),
      0.06,
      0.45,
    )
    const proposed = clamp(
      Math.round(current.bitrateKbps * (1 - reduction)),
      params.minBitrateKbps,
      params.maxBitrateKbps,
    )
    if (passesBitrateDeadband(current.bitrateKbps, proposed, params)) {
      target.bitrateKbps = proposed
    }
  } else if (healthy && current.bitrateKbps < params.maxBitrateKbps) {
    const proposed = Math.min(
      params.maxBitrateKbps,
      Math.round(current.bitrateKbps * (1 + params.bitrateIncreaseFraction)),
    )
    if (passesBitrateDeadband(current.bitrateKbps, proposed, params)) {
      target.bitrateKbps = proposed
    }
  } else if (stressed && pressure.latency > 0.2 && objectiveBias >= 0.5) {
    const proposed = clamp(
      Math.round(current.bitrateKbps * 0.93),
      params.minBitrateKbps,
      params.maxBitrateKbps,
    )
    if (passesBitrateDeadband(current.bitrateKbps, proposed, params)) {
      target.bitrateKbps = proposed
    }
  }

  if (objectiveBias < 0.5 && pressure.latency > 0.3) {
    const proposed = lowerFpsStep(current.fps, params.maxFps)
    if (
      proposed !== undefined &&
      current.fps - proposed >= params.fpsDeadband
    ) {
      target.fps = proposed
    }
  }

  if (pressure.decode > 0.35) {
    const scale = clamp(1 - pressure.decode * 0.3, 0.45, 0.92)
    const proposed = scaleResolution(current, scale)
    if (passesResolutionDeadband(current.resolution, proposed, params)) {
      target.resolution = proposed
    }
  }

  return hasAnyTarget(target)
    ? { kind: "target", target, pressure }
    : { kind: "dormant", reason: "within-hysteresis" }
}

function computePressure(summary: StreamHealthSummary): StreamAdaptivePressure {
  const delivery = summary.bitrateDeliveryRatio ?? 1
  const loss = summary.lossFraction.mean ?? 0
  const bandwidth = clamp01((1 - delivery) * 1.4 + loss * 4)

  const rtt = summary.rttMs.mean ?? 25
  const rttTrend = summary.rttMs.trend === "rising" ? 0.12 : 0
  const rttVariance = summary.rttVarianceMs.mean ?? 0
  const latency = clamp01((rtt - 45) / 90 + rttVariance / 120 + rttTrend)

  const queue = summary.queueDepth.mean ?? 0
  const decodeTime = summary.decodeTimeMs.mean ?? 0
  const drops = summary.frameDropFraction ?? 0
  const decode = clamp01((queue - 2) / 8 + (decodeTime - 16) / 60 + drops * 5)

  return { bandwidth, latency, decode }
}

function lowerFpsStep(currentFps: number, maxFps: number): number | undefined {
  const steps = FPS_STEPS.filter(step => step <= maxFps)
  const lower = [...steps].reverse().find(step => step < currentFps)
  return lower
}

function scaleResolution(
  current: StreamAdaptiveSettings,
  scale: number,
): StreamAdaptiveResolution {
  const baseline = current.baselineResolution
  const maxWidth = Math.min(current.resolution.width, baseline.width)
  const maxHeight = Math.min(current.resolution.height, baseline.height)
  const rawWidth = Math.min(maxWidth, current.resolution.width * scale)
  const rawHeight = rawWidth * (baseline.height / baseline.width)
  const width = even(Math.max(2, Math.min(maxWidth, rawWidth)))
  const height = even(Math.max(2, Math.min(maxHeight, rawHeight)))
  return { width, height }
}

function passesBitrateDeadband(
  current: number,
  proposed: number,
  params: Required<StreamAdaptiveControllerParams>,
): boolean {
  return (
    Math.abs(proposed - current) / Math.max(1, current) >=
    params.bitrateDeadbandFraction
  )
}

function passesResolutionDeadband(
  current: StreamAdaptiveResolution,
  proposed: StreamAdaptiveResolution,
  params: Required<StreamAdaptiveControllerParams>,
): boolean {
  const currentPixels = current.width * current.height
  const proposedPixels = proposed.width * proposed.height
  return (
    Math.abs(currentPixels - proposedPixels) / Math.max(1, currentPixels) >=
    params.resolutionDeadbandFraction
  )
}

function hasAnyTarget(target: StreamAdaptiveTarget): boolean {
  return (
    target.bitrateKbps !== undefined ||
    target.fps !== undefined ||
    target.resolution !== undefined
  )
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2)
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
