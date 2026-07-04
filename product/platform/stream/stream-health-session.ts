import type { StreamControlSession } from "@platform/stream-control/stream-control-session"
import type { StreamHealthSample } from "./stream-health"
import type { StreamHealthSamplePort } from "./stream-health-monitor"

export interface StreamHealthSamplePortFromSessionOptions {
  readonly nowMs?: () => number
}

export function streamHealthSamplePortFromSession(
  session: Pick<StreamControlSession, "onEvent">,
  options: StreamHealthSamplePortFromSessionOptions = {},
): StreamHealthSamplePort {
  const nowMs = options.nowMs ?? (() => Date.now())
  return {
    onSample: listener =>
      session.onEvent(delivery => {
        const sample = streamHealthSampleFromEvent(delivery.event)
        if (sample) listener({ ...sample, sampledAtMs: nowMs() })
      }),
  }
}

function streamHealthSampleFromEvent(
  event: unknown,
): StreamHealthSample | undefined {
  if (!isRecord(event) || event.name !== "quality.sample") return undefined
  const sample = event.sample
  if (!isRecord(sample)) return undefined
  const seq = numberField(sample, "seq")
  const sampledAtMs = numberField(sample, "sampledAtMs")
  if (seq === undefined || sampledAtMs === undefined) return undefined
  return {
    seq,
    sampledAtMs,
    rttMs: numberField(sample, "rttMs"),
    rttVarianceMs: numberField(sample, "rttVarianceMs"),
    lossFraction: numberField(sample, "lossFraction"),
    deliveredBitrateKbps: numberField(sample, "deliveredBitrateKbps"),
    requestedBitrateKbps: numberField(sample, "requestedBitrateKbps"),
    deliveredFps: numberField(sample, "deliveredFps"),
    requestedFps: numberField(sample, "requestedFps"),
    framesDropped: numberField(sample, "framesDropped"),
    decodeTimeMs: numberField(sample, "decodeTimeMs"),
    queueDepth: numberField(sample, "queueDepth"),
    firstFrameMs: numberField(sample, "firstFrameMs"),
  }
}

function numberField(
  record: Readonly<Record<string, unknown>>,
  key: string,
): number | undefined {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
