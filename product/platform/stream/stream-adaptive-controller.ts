import type { StreamBoundaries } from "./stream-adaptive-boundaries"
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
  readonly fpsRecoverStep?: number
  readonly resolutionRecoverFraction?: number
  readonly coldStartSampleCount?: number
  readonly coldStartBitrateKbps?: number
  readonly coldStartIncreaseFraction?: number
}

export type StreamAdaptiveControllerPhase = "steady" | "establishing"
export type StreamAdaptiveControllerMode = "establish" | "fine-tune" | "shed"
export type StreamAdaptiveBindingConstraint =
  | "bitrate"
  | "fps"
  | "resolution"
  | "max-latency"
  | "min-fps"

export interface StreamAdaptiveControllerInput {
  readonly summary: StreamHealthSummary
  readonly current: StreamAdaptiveSettings
  /** 0 = latency-biased, 1 = quality-biased. */
  readonly objectiveBias: number
  readonly params?: StreamAdaptiveControllerParams
  readonly boundaries?: StreamBoundaries
  readonly phase?: StreamAdaptiveControllerPhase
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
      readonly mode: StreamAdaptiveControllerMode
      readonly bindingConstraint?: StreamAdaptiveBindingConstraint
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
  fpsRecoverStep: 1,
  resolutionRecoverFraction: 0.18,
  coldStartSampleCount: 3,
  coldStartBitrateKbps: 8_000,
  coldStartIncreaseFraction: 0.28,
}

const FPS_STEPS = [15, 30, 40, 45, 60, 75, 90, 100, 120, 144, 240]
const TARGET_BITS_PER_PIXEL = 0.06
const MIN_BITS_PER_PIXEL = 0.035

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
  const boundaries = input.boundaries
  const objectiveBias = clamp(boundaries?.lean ?? input.objectiveBias, 0, 1)
  const pressure = computePressure(summary)
  const mode = modeFor(input, pressure, params)
  const target: MutableTarget = {}
  let bindingConstraint: StreamAdaptiveBindingConstraint | undefined

  if (boundaries?.auto === "off") {
    return { kind: "dormant", reason: "within-hysteresis" }
  }

  if (mode === "establish") {
    const conservative = Math.min(
      bitrateCeiling(boundaries, params),
      params.coldStartBitrateKbps,
    )
    if (summary.sampleCount < params.coldStartSampleCount) {
      maybeSetBitrate(target, current, conservative, boundaries, params, true)
    } else if (healthyEnoughForGrowth(pressure)) {
      maybeSetBitrate(
        target,
        current,
        Math.round(current.bitrateKbps * (1 + params.coldStartIncreaseFraction)),
        boundaries,
        params,
      )
    }
  } else {
    bindingConstraint = applySteadyStateDecision(
      target,
      input,
      pressure,
      objectiveBias,
      params,
      boundaries,
      mode,
    )
  }

  if (mode !== "shed" && healthyEnoughForGrowth(pressure)) {
    recoverFps(target, current, boundaries, params)
    recoverResolution(target, current, pressure, boundaries, params)
  }

  if (hasAnyTarget(target)) {
    return { kind: "target", target, pressure, mode, bindingConstraint }
  }
  return { kind: "dormant", reason: "within-hysteresis" }
}

function applySteadyStateDecision(
  target: MutableTarget,
  input: StreamAdaptiveControllerInput,
  pressure: StreamAdaptivePressure,
  objectiveBias: number,
  params: Required<StreamAdaptiveControllerParams>,
  boundaries: StreamBoundaries | undefined,
  mode: StreamAdaptiveControllerMode,
): StreamAdaptiveBindingConstraint | undefined {
  const { summary, current } = input
  const maxLatencyMs = boundaries?.outcomes.maxLatencyMs
  const latencyClampBinding =
    maxLatencyMs !== undefined && (summary.rttMs.mean ?? 0) > maxLatencyMs

  const stressed =
    mode === "shed" ||
    pressure.bandwidth > 0.12 ||
    pressure.latency > 0.35 ||
    pressure.decode > 0.35 ||
    latencyClampBinding
  const healthy = healthyEnoughForGrowth(pressure)

  let bindingConstraint: StreamAdaptiveBindingConstraint | undefined =
    latencyClampBinding ? "max-latency" : undefined

  if (pressure.bandwidth > 0.1 || mode === "shed") {
    const cliffMultiplier = mode === "shed" ? 1.65 : 1
    const reduction = clamp(
      pressure.bandwidth * cliffMultiplier * (0.45 - objectiveBias * 0.15),
      mode === "shed" ? 0.35 : 0.06,
      mode === "shed" ? 0.7 : 0.45,
    )
    maybeSetBitrate(
      target,
      current,
      Math.round(current.bitrateKbps * (1 - reduction)),
      boundaries,
      params,
      mode === "shed",
    )
  } else if (healthy && current.bitrateKbps < bitrateCeiling(boundaries, params)) {
    maybeSetBitrate(
      target,
      current,
      Math.round(current.bitrateKbps * (1 + params.bitrateIncreaseFraction)),
      boundaries,
      params,
    )
  } else if (stressed && pressure.latency > 0.2 && objectiveBias >= 0.5) {
    maybeSetBitrate(
      target,
      current,
      Math.round(current.bitrateKbps * 0.93),
      boundaries,
      params,
    )
  }

  if (
    mode === "shed" ||
    (objectiveBias < 0.5 && pressure.latency > 0.3) ||
    latencyClampBinding
  ) {
    const proposed = lowerFpsStep(current.fps, fpsCeiling(boundaries, params))
    if (proposed !== undefined) {
      if (
        boundaries?.outcomes.minDeliveredFps !== undefined &&
        proposed < boundaries.outcomes.minDeliveredFps
      ) {
        bindingConstraint = bindingConstraint ?? "min-fps"
      }
      maybeSetFps(target, current, proposed, boundaries, params, mode === "shed")
    }
  }

  const bppStarved = bitsPerPixel(current) < MIN_BITS_PER_PIXEL
  if (pressure.decode > 0.35 || bppStarved || mode === "shed") {
    const scale = scaleForResolutionShrink(current, pressure, mode, bppStarved)
    const proposed = scaleResolution(current, scale)
    maybeSetResolution(target, current, proposed, boundaries, params, mode === "shed")
  }

  return bindingConstraint
}

function recoverFps(
  target: MutableTarget,
  current: StreamAdaptiveSettings,
  boundaries: StreamBoundaries | undefined,
  params: Required<StreamAdaptiveControllerParams>,
): void {
  const ceiling = fpsCeiling(boundaries, params)
  if (current.fps >= ceiling || isPinned(boundaries?.levers.fps)) return
  const proposed = higherFpsStep(current.fps, ceiling, params.fpsRecoverStep)
  if (proposed !== undefined) maybeSetFps(target, current, proposed, boundaries, params)
}

function recoverResolution(
  target: MutableTarget,
  current: StreamAdaptiveSettings,
  pressure: StreamAdaptivePressure,
  boundaries: StreamBoundaries | undefined,
  params: Required<StreamAdaptiveControllerParams>,
): void {
  if (isPinned(boundaries?.levers.resolution)) return
  if (pressure.decode > 0.04 || bitsPerPixel(current) < TARGET_BITS_PER_PIXEL) return
  const ceiling = resolutionCeiling(boundaries, current)
  if (current.resolution.width >= ceiling.width && current.resolution.height >= ceiling.height) return
  const proposed = growResolution(current, ceiling, params.resolutionRecoverFraction)
  maybeSetResolution(target, current, proposed, boundaries, params)
}

function maybeSetBitrate(
  target: MutableTarget,
  current: StreamAdaptiveSettings,
  proposed: number,
  boundaries: StreamBoundaries | undefined,
  params: Required<StreamAdaptiveControllerParams>,
  bypassDeadband = false,
): void {
  const lever = boundaries?.levers.bitrate
  if (isPinned(lever)) return
  const clamped = clamp(Math.round(proposed), bitrateFloor(boundaries, params), bitrateCeiling(boundaries, params))
  if (clamped === current.bitrateKbps) return
  if (bypassDeadband || passesBitrateDeadband(current.bitrateKbps, clamped, params)) {
    target.bitrateKbps = clamped
  }
}

function maybeSetFps(
  target: MutableTarget,
  current: StreamAdaptiveSettings,
  proposed: number,
  boundaries: StreamBoundaries | undefined,
  params: Required<StreamAdaptiveControllerParams>,
  bypassDeadband = false,
): void {
  const lever = boundaries?.levers.fps
  if (isPinned(lever)) return
  const ceiling = fpsCeiling(boundaries, params)
  const floor = Math.min(
    ceiling,
    Math.max(lever?.floor ?? 1, boundaries?.outcomes.minDeliveredFps ?? 1),
  )
  const clamped = clamp(Math.round(proposed), floor, ceiling)
  if (clamped === current.fps) return
  if (bypassDeadband || Math.abs(current.fps - clamped) >= params.fpsDeadband) {
    target.fps = clamped
  }
}

function maybeSetResolution(
  target: MutableTarget,
  current: StreamAdaptiveSettings,
  proposed: StreamAdaptiveResolution,
  boundaries: StreamBoundaries | undefined,
  params: Required<StreamAdaptiveControllerParams>,
  bypassDeadband = false,
): void {
  const lever = boundaries?.levers.resolution
  if (isPinned(lever)) return
  const clamped = clampResolution(proposed, current, boundaries)
  if (clamped.width === current.resolution.width && clamped.height === current.resolution.height) return
  if (bypassDeadband || passesResolutionDeadband(current.resolution, clamped, params)) {
    target.resolution = clamped
  }
}

function modeFor(
  input: StreamAdaptiveControllerInput,
  pressure: StreamAdaptivePressure,
  params: Required<StreamAdaptiveControllerParams>,
): StreamAdaptiveControllerMode {
  if (isCliff(input.summary, pressure)) return "shed"
  if (input.phase === "establishing") return "establish"
  return "fine-tune"
}

function isCliff(summary: StreamHealthSummary, pressure: StreamAdaptivePressure): boolean {
  const delivery = summary.bitrateDeliveryRatio ?? 1
  const loss = summary.lossFraction.mean ?? 0
  const queueRising = summary.queueDepth.trend === "rising" && (summary.queueDepth.mean ?? 0) >= 6
  const rttRising = summary.rttMs.trend === "rising" && (summary.rttMs.mean ?? 0) >= 100
  return delivery < 0.45 || loss >= 0.08 || pressure.bandwidth > 0.7 || (queueRising && rttRising)
}

function healthyEnoughForGrowth(pressure: StreamAdaptivePressure): boolean {
  return pressure.bandwidth < 0.02 && pressure.latency < 0.1 && pressure.decode < 0.1
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

function higherFpsStep(currentFps: number, maxFps: number, stepCount: number): number | undefined {
  const steps = FPS_STEPS.filter(step => step <= maxFps)
  const index = steps.findIndex(step => step > currentFps)
  if (index < 0) return undefined
  return steps[Math.min(steps.length - 1, index + Math.max(0, stepCount - 1))]
}

function scaleForResolutionShrink(
  current: StreamAdaptiveSettings,
  pressure: StreamAdaptivePressure,
  mode: StreamAdaptiveControllerMode,
  bppStarved: boolean,
): number {
  if (mode === "shed") return clamp(1 - Math.max(pressure.bandwidth, pressure.decode) * 0.35, 0.45, 0.82)
  if (bppStarved) {
    const targetPixels = Math.max(
      1,
      (current.bitrateKbps * 1000) / (TARGET_BITS_PER_PIXEL * current.fps),
    )
    const currentPixels = current.resolution.width * current.resolution.height
    return clamp(Math.sqrt(targetPixels / currentPixels), 0.45, 0.88)
  }
  return clamp(1 - pressure.decode * 0.3, 0.45, 0.92)
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

function growResolution(
  current: StreamAdaptiveSettings,
  ceiling: StreamAdaptiveResolution,
  fraction: number,
): StreamAdaptiveResolution {
  const baseline = current.baselineResolution
  const targetWidth = Math.min(ceiling.width, current.resolution.width * (1 + fraction))
  const targetHeight = targetWidth * (baseline.height / baseline.width)
  return {
    width: even(Math.min(ceiling.width, targetWidth)),
    height: even(Math.min(ceiling.height, targetHeight)),
  }
}

function clampResolution(
  proposed: StreamAdaptiveResolution,
  current: StreamAdaptiveSettings,
  boundaries: StreamBoundaries | undefined,
): StreamAdaptiveResolution {
  const floor = boundaries?.levers.resolution?.floor
  const ceiling = resolutionCeiling(boundaries, current)
  const aspect = current.baselineResolution.height / current.baselineResolution.width
  const minWidth = Math.max(floor?.width ?? 2, floor?.height === undefined ? 2 : floor.height / aspect)
  const maxWidth = Math.min(ceiling.width, ceiling.height / aspect)
  const width = even(clamp(proposed.width, minWidth, Math.max(minWidth, maxWidth)))
  const height = even(width * aspect)
  return { width, height }
}

function bitrateFloor(
  boundaries: StreamBoundaries | undefined,
  params: Required<StreamAdaptiveControllerParams>,
): number {
  return boundaries?.levers.bitrate?.floor ?? params.minBitrateKbps
}

function bitrateCeiling(
  boundaries: StreamBoundaries | undefined,
  params: Required<StreamAdaptiveControllerParams>,
): number {
  return boundaries?.levers.bitrate?.ceiling ?? params.maxBitrateKbps
}

function fpsCeiling(
  boundaries: StreamBoundaries | undefined,
  params: Required<StreamAdaptiveControllerParams>,
): number {
  return boundaries?.levers.fps?.ceiling ?? params.maxFps
}

function resolutionCeiling(
  boundaries: StreamBoundaries | undefined,
  current: StreamAdaptiveSettings,
): StreamAdaptiveResolution {
  return boundaries?.levers.resolution?.ceiling ?? current.baselineResolution
}

function bitsPerPixel(current: StreamAdaptiveSettings): number {
  const pixelsPerSecond = current.resolution.width * current.resolution.height * current.fps
  return (current.bitrateKbps * 1000) / Math.max(1, pixelsPerSecond)
}

function isPinned(lever: { readonly pinned?: unknown } | undefined): boolean {
  return lever?.pinned !== undefined
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

type MutableTarget = {
  bitrateKbps?: number
  fps?: number
  resolution?: StreamAdaptiveResolution
}
