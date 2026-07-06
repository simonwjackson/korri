import type { StreamControlSession } from "@platform/stream-control/stream-control-session"
import type { StreamHealthSample } from "./stream-health"
import type { StreamHealthSamplePort } from "./stream-health-monitor"

export interface StreamHealthSamplePortFromSessionOptions {
  readonly nowMs?: () => number
  readonly pollState?: () => Promise<unknown>
  readonly pollIntervalMs?: number
}

export function streamHealthSamplePortFromSession(
  session: Pick<StreamControlSession, "onEvent">,
  options: StreamHealthSamplePortFromSessionOptions = {},
): StreamHealthSamplePort {
  const nowMs = options.nowMs ?? (() => Date.now())
  return {
    onSample: listener => {
      let closed = false
      const publish = (sample: StreamHealthSample | undefined) => {
        if (closed || !sample) return
        listener({ ...sample, sampledAtMs: nowMs() })
      }
      const unsubscribe = session.onEvent(delivery => {
        publish(streamHealthSampleFromEvent(delivery.event))
      })
      const interval = options.pollState
        ? setInterval(() => {
            void options
              .pollState?.()
              .then(state => publish(streamHealthSampleFromState(state)))
              .catch(() => undefined)
          }, options.pollIntervalMs ?? 1_000)
        : undefined
      interval?.unref?.()
      return () => {
        closed = true
        unsubscribe()
        if (interval !== undefined) clearInterval(interval)
      }
    },
  }
}

function streamHealthSampleFromEvent(
  event: unknown,
): StreamHealthSample | undefined {
  if (!isRecord(event) || event.name !== "quality.sample") return undefined
  return streamHealthSampleFromRecord(event.sample)
}

function streamHealthSampleFromState(
  state: unknown,
): StreamHealthSample | undefined {
  const result = recordField(state, "result") ?? asRecord(state)
  const streamQuality = recordField(result, "streamQuality")
  return streamHealthSampleFromRecord(streamQuality?.sample)
}

function streamHealthSampleFromRecord(
  sample: unknown,
): StreamHealthSample | undefined {
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

function recordField(
  input: unknown,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  const record = asRecord(input)
  return asRecord(record?.[key])
}

function asRecord(
  input: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return isRecord(input) ? input : undefined
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
