import type { StreamAdaptivePressure } from "./stream-adaptive-controller"
import type { StreamHealthSummary } from "./stream-health"

export interface StreamHandoffSignal {
  readonly signalPercent?: number
  readonly handoffInProgress?: boolean
}

export interface StreamHandoffHint {
  readonly kind: "collapse-likely"
  readonly severity: number
}

export interface StreamEarlyDownshiftTrigger {
  readonly kind: "triggered"
  readonly reasonCode:
    | "rtt-slope-delivery-drop"
    | "fps-delivery-drop"
    | "stale-health"
    | "hint-corroborated"
  readonly hintRole: "none" | "corroborating"
  readonly pressure: StreamAdaptivePressure
  readonly evidence: Readonly<Record<string, unknown>>
}

export interface StreamEarlyDownshiftIgnored {
  readonly kind: "ignored"
  readonly reasonCode: "healthy" | "hint-without-health-evidence" | "no-data"
  readonly hintRole: "none" | "context-only"
  readonly evidence: Readonly<Record<string, unknown>>
}

export type StreamEarlyDownshiftDecision =
  | StreamEarlyDownshiftTrigger
  | StreamEarlyDownshiftIgnored

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

export function detectEarlyStreamDownshift(
  summary: StreamHealthSummary,
  hint?: StreamHandoffHint,
): StreamEarlyDownshiftDecision {
  const evidence = healthEvidence(summary, hint)
  if (summary.freshness === "no-data") {
    return { kind: "ignored", reasonCode: "no-data", hintRole: hint ? "context-only" : "none", evidence }
  }
  if (summary.freshness === "stale") {
    return triggered("stale-health", "none", summary, hint, evidence)
  }

  const rtt = summary.rttMs.mean ?? 0
  const rttRising = summary.rttMs.trend === "rising"
  const variance = summary.rttVarianceMs.mean ?? 0
  const loss = summary.lossFraction.mean ?? 0
  const lossRising = summary.lossFraction.trend === "rising"
  const bitrateRatio = summary.bitrateDeliveryRatio ?? 1
  const fpsRatio = summary.fpsDeliveryRatio ?? 1
  const queue = summary.queueDepth.mean ?? 0
  const queueRising = summary.queueDepth.trend === "rising"

  const corroboratedRtt =
    rttRising &&
    rtt >= 80 &&
    (bitrateRatio <= 0.82 || fpsRatio <= 0.9 || variance >= 25 || loss >= 0.01 || queue >= 3)
  if (corroboratedRtt) {
    return triggered("rtt-slope-delivery-drop", "none", summary, hint, evidence)
  }

  const fpsCollapse = fpsRatio <= 0.78 && (rtt >= 65 || queueRising || lossRising)
  if (fpsCollapse) {
    return triggered("fps-delivery-drop", "none", summary, hint, evidence)
  }

  const mildDegradation =
    rttRising ||
    rtt >= 65 ||
    bitrateRatio <= 0.9 ||
    fpsRatio <= 0.95 ||
    loss >= 0.005 ||
    queue >= 2
  if (hint && mildDegradation) {
    return triggered("hint-corroborated", "corroborating", summary, hint, evidence)
  }

  if (hint) {
    return {
      kind: "ignored",
      reasonCode: "hint-without-health-evidence",
      hintRole: "context-only",
      evidence,
    }
  }
  return { kind: "ignored", reasonCode: "healthy", hintRole: "none", evidence }
}

function triggered(
  reasonCode: StreamEarlyDownshiftTrigger["reasonCode"],
  hintRole: StreamEarlyDownshiftTrigger["hintRole"],
  summary: StreamHealthSummary,
  hint: StreamHandoffHint | undefined,
  evidence: Readonly<Record<string, unknown>>,
): StreamEarlyDownshiftTrigger {
  const bandwidth = Math.max(0.9, 1 - (summary.bitrateDeliveryRatio ?? 1))
  const latency = Math.max(
    0.75,
    (summary.rttMs.mean ?? 45) >= 80 || summary.rttMs.trend === "rising" ? 0.8 : 0,
    hint ? handoffHintPressure(hint).latency : 0,
  )
  const decode = Math.max(
    summary.queueDepth.trend === "rising" || (summary.queueDepth.mean ?? 0) >= 3 ? 0.6 : 0,
    (summary.frameDropFraction ?? 0) * 4,
  )
  return {
    kind: "triggered",
    reasonCode,
    hintRole,
    pressure: { bandwidth: clamp01(bandwidth), latency: clamp01(latency), decode: clamp01(decode) },
    evidence,
  }
}

function healthEvidence(
  summary: StreamHealthSummary,
  hint: StreamHandoffHint | undefined,
): Readonly<Record<string, unknown>> {
  return {
    freshness: summary.freshness,
    sampleCount: summary.sampleCount,
    rttMs: summary.rttMs.mean,
    rttTrend: summary.rttMs.trend,
    rttVarianceMs: summary.rttVarianceMs.mean,
    lossFraction: summary.lossFraction.mean,
    lossTrend: summary.lossFraction.trend,
    bitrateDeliveryRatio: summary.bitrateDeliveryRatio,
    fpsDeliveryRatio: summary.fpsDeliveryRatio,
    queueDepth: summary.queueDepth.mean,
    queueTrend: summary.queueDepth.trend,
    frameDropFraction: summary.frameDropFraction,
    hintKind: hint?.kind,
    hintSeverity: hint?.severity,
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
