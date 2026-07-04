import {
  createStreamHealthWindow,
  ingestStreamHealthSample,
  type StreamHealthSample,
  type StreamHealthSummary,
  type StreamHealthWindow,
  type StreamHealthWindowOptions,
  summarizeStreamHealth,
} from "./stream-health"

export interface StreamHealthSamplePort {
  readonly onSample: (
    listener: (sample: StreamHealthSample) => void,
  ) => () => void
}

export interface StreamHealthMonitorOptions {
  readonly port: StreamHealthSamplePort
  readonly window?: StreamHealthWindowOptions
}

export interface StreamHealthMonitor {
  readonly latestSummary: (nowMs: number) => StreamHealthSummary
  readonly close: () => void
}

export function createStreamHealthMonitor(
  options: StreamHealthMonitorOptions,
): StreamHealthMonitor {
  let window: StreamHealthWindow = createStreamHealthWindow(options.window)
  let closed = false

  const unsubscribe = options.port.onSample(sample => {
    if (closed) return
    window = ingestStreamHealthSample(window, sample)
  })

  return {
    latestSummary: nowMs => summarizeStreamHealth(window, nowMs),
    close: () => {
      if (closed) return
      closed = true
      unsubscribe()
    },
  }
}
