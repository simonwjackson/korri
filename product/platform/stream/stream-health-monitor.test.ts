import { describe, expect, it } from "bun:test"
import {
  createStreamHealthMonitor,
  type StreamHealthSamplePort,
} from "./stream-health-monitor"
import type { StreamHealthSample } from "./stream-health"

function makePort() {
  const listeners: ((sample: StreamHealthSample) => void)[] = []
  let unsubscribeCount = 0
  const port: StreamHealthSamplePort = {
    onSample: listener => {
      listeners.push(listener)
      return () => {
        unsubscribeCount += 1
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
  }
  return {
    port,
    emit: (sample: StreamHealthSample) => {
      for (const listener of [...listeners]) listener(sample)
    },
    listenerCount: () => listeners.length,
    unsubscribeCount: () => unsubscribeCount,
  }
}

const sample = (seq: number, sampledAtMs: number): StreamHealthSample => ({
  seq,
  sampledAtMs,
  rttMs: 20 + seq,
  lossFraction: 0.01,
})

describe("createStreamHealthMonitor", () => {
  it("updates its latest summary from samples pushed through the port", () => {
    const harness = makePort()
    const monitor = createStreamHealthMonitor({
      port: harness.port,
      window: { maxSamples: 4 },
    })

    harness.emit(sample(1, 1_000))
    harness.emit(sample(2, 2_000))

    const summary = monitor.latestSummary(2_100)
    expect(summary.freshness).toBe("fresh")
    expect(summary.sampleCount).toBe(2)
    expect(summary.rttMs.mean).toBe(21.5)
  })

  it("reports stale when no sample arrives inside the staleness window", () => {
    const harness = makePort()
    const monitor = createStreamHealthMonitor({
      port: harness.port,
      window: { staleAfterMs: 500 },
    })

    harness.emit(sample(1, 1_000))

    expect(monitor.latestSummary(1_501).freshness).toBe("stale")
  })

  it("starts as no-data before the first sample", () => {
    const monitor = createStreamHealthMonitor({ port: makePort().port })

    expect(monitor.latestSummary(1_000).freshness).toBe("no-data")
  })

  it("unsubscribes on close and ignores later samples", () => {
    const harness = makePort()
    const monitor = createStreamHealthMonitor({ port: harness.port })

    harness.emit(sample(1, 1_000))
    monitor.close()
    harness.emit(sample(2, 2_000))

    expect(harness.listenerCount()).toBe(0)
    expect(harness.unsubscribeCount()).toBe(1)
    expect(monitor.latestSummary(2_100).sampleCount).toBe(1)
  })
})
