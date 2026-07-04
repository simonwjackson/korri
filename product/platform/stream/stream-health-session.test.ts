import { describe, expect, it } from "bun:test"
import type { StreamControlSession } from "@platform/stream-control/stream-control-session"
import { createStreamHealthMonitor } from "./stream-health-monitor"
import { streamHealthSamplePortFromSession } from "./stream-health-session"

function makeSession() {
  const listeners: ((delivery: { seq: number; event: unknown }) => void)[] = []
  let unsubscribeCount = 0
  const session: StreamControlSession = {
    hello: async () => ({}),
    state: async () => ({}),
    subscribe: async () => ({}),
    setBitrate: async () => ({}),
    setFps: async () => ({}),
    setResolution: async () => ({}),
    setTouchBounds: async () => ({}),
    onEvent: listener => {
      listeners.push(listener)
      return () => {
        unsubscribeCount += 1
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
    close: () => {},
  }
  return {
    session,
    emit: (event: unknown) => {
      for (const listener of [...listeners]) listener({ seq: 1, event })
    },
    listenerCount: () => listeners.length,
    unsubscribeCount: () => unsubscribeCount,
  }
}

describe("streamHealthSamplePortFromSession", () => {
  it("forwards quality.sample events into the stream health monitor", () => {
    const harness = makeSession()
    const monitor = createStreamHealthMonitor({
      port: streamHealthSamplePortFromSession(harness.session, {
        nowMs: () => 5_000,
      }),
    })

    harness.emit({
      name: "quality.sample",
      sample: { seq: 1, sampledAtMs: 1000, rttMs: 20, lossFraction: 0.01 },
    })

    const summary = monitor.latestSummary(5_100)
    expect(summary.rttMs.mean).toBe(20)
    expect(summary.freshness).toBe("fresh")
  })

  it("maps the full quality.sample payload into the monitor summary", () => {
    const harness = makeSession()
    const monitor = createStreamHealthMonitor({
      port: streamHealthSamplePortFromSession(harness.session, {
        nowMs: () => 5_000,
      }),
    })

    harness.emit({
      name: "quality.sample",
      sample: {
        seq: 1,
        sampledAtMs: 1_000,
        rttMs: 20,
        rttVarianceMs: 4,
        lossFraction: 0.02,
        deliveredBitrateKbps: 9_000,
        requestedBitrateKbps: 10_000,
        deliveredFps: 54,
        requestedFps: 60,
        framesDropped: 3,
        decodeTimeMs: 7,
        queueDepth: 2,
        firstFrameMs: 80,
      },
    })

    const summary = monitor.latestSummary(5_100)
    expect(summary.bitrateDeliveryRatio).toBe(0.9)
    expect(summary.fpsDeliveryRatio).toBe(0.9)
    expect(summary.framesDropped.total).toBe(3)
    expect(summary.decodeTimeMs.mean).toBe(7)
    expect(summary.queueDepth.mean).toBe(2)
    expect(summary.firstFrameMs.mean).toBe(80)
  })

  it("ignores non-sample and malformed sample events", () => {
    const harness = makeSession()
    const monitor = createStreamHealthMonitor({
      port: streamHealthSamplePortFromSession(harness.session),
    })

    harness.emit({ name: "quality.connection", connection: "poor" })
    harness.emit({ name: "quality.sample", sample: { sampledAtMs: 1000 } })
    harness.emit("not an event")

    expect(monitor.latestSummary(1100).freshness).toBe("no-data")
  })

  it("unsubscribes from the session when the port listener is closed", () => {
    const harness = makeSession()
    const unsubscribe = streamHealthSamplePortFromSession(
      harness.session,
    ).onSample(() => {})

    unsubscribe()

    expect(harness.listenerCount()).toBe(0)
    expect(harness.unsubscribeCount()).toBe(1)
  })
})
