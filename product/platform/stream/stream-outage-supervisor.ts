export type StreamOutageState = "connected" | "hold" | "reconnecting"

export type StreamOutageEvent =
  | { readonly kind: "outage-detected" }
  | { readonly kind: "reconnecting" }
  | { readonly kind: "resumed" }
  | { readonly kind: "reconnect-failed"; readonly message: string }

export type StreamOutageAction = { readonly kind: "re-establish" } | undefined

export interface StreamOutageSample {
  readonly freshness?: "fresh" | "stale" | "no-data"
  readonly bitrateDeliveryRatio?: number
  readonly fpsDeliveryRatio?: number
  readonly frameDropFraction?: number
}

export interface StreamOutageSupervisorOptions {
  readonly onEvent: (event: StreamOutageEvent) => void
  readonly lossAfterMs?: number
}

export interface StreamOutageSupervisor {
  readonly observe: (nowMs: number, sample: StreamOutageSample) => StreamOutageAction
  readonly state: () => StreamOutageState
  readonly markReestablished: () => void
  readonly markReconnectFailed: (message: string) => void
}

const DEFAULT_LOSS_AFTER_MS = 2_000
const LOSS_RATIO = 0.02
const RETURN_RATIO = 0.1

export function createStreamOutageSupervisor(
  options: StreamOutageSupervisorOptions,
): StreamOutageSupervisor {
  const lossAfterMs = Math.max(1, options.lossAfterMs ?? DEFAULT_LOSS_AFTER_MS)
  let state: StreamOutageState = "connected"
  let lossStartedAtMs: number | undefined

  function observe(nowMs: number, sample: StreamOutageSample): StreamOutageAction {
    const lost = isLost(sample)
    const returned = hasReturned(sample)

    if (state === "hold") {
      if (returned) {
        state = "reconnecting"
        options.onEvent({ kind: "reconnecting" })
        return { kind: "re-establish" }
      }
      return undefined
    }

    if (state === "reconnecting") return undefined

    if (!lost) {
      lossStartedAtMs = undefined
      return undefined
    }

    lossStartedAtMs ??= nowMs
    if (nowMs - lossStartedAtMs >= lossAfterMs) {
      state = "hold"
      options.onEvent({ kind: "outage-detected" })
    }
    return undefined
  }

  return {
    observe,
    state: () => state,
    markReestablished: () => {
      lossStartedAtMs = undefined
      state = "connected"
      options.onEvent({ kind: "resumed" })
    },
    markReconnectFailed: message => {
      options.onEvent({ kind: "reconnect-failed", message })
    },
  }
}

function isLost(sample: StreamOutageSample): boolean {
  if (sample.freshness === "no-data" || sample.freshness === "stale") return true
  const bitrate = sample.bitrateDeliveryRatio ?? 1
  const fps = sample.fpsDeliveryRatio ?? 1
  return bitrate <= LOSS_RATIO && fps <= LOSS_RATIO
}

function hasReturned(sample: StreamOutageSample): boolean {
  if (sample.freshness === "no-data" || sample.freshness === "stale") return false
  return (sample.bitrateDeliveryRatio ?? 0) > RETURN_RATIO || (sample.fpsDeliveryRatio ?? 0) > RETURN_RATIO
}
