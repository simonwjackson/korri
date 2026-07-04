import { describe, expect, it } from "bun:test"
import {
  createStreamHealthWindow,
  ingestStreamHealthSample,
  type StreamHealthSample,
  summarizeStreamHealth,
} from "./stream-health"

const sample = (
  seq: number,
  sampledAtMs: number,
  overrides: Partial<StreamHealthSample> = {},
): StreamHealthSample => ({
  seq,
  sampledAtMs,
  rttMs: 20 + seq,
  rttVarianceMs: 3,
  lossFraction: 0.01,
  deliveredBitrateKbps: 9_000,
  requestedBitrateKbps: 10_000,
  deliveredFps: 54,
  requestedFps: 60,
  framesDropped: seq,
  decodeTimeMs: 6,
  queueDepth: 2,
  ...overrides,
})

describe("stream health rolling summary", () => {
  it("summarizes RTT, loss, delivered/requested ratios, drops, and decode time", () => {
    const window = [
      sample(1, 1_000, { rttMs: 20, lossFraction: 0.01, framesDropped: 1 }),
      sample(2, 2_000, { rttMs: 30, lossFraction: 0.03, framesDropped: 3 }),
    ].reduce(
      ingestStreamHealthSample,
      createStreamHealthWindow({ maxSamples: 8 }),
    )

    const summary = summarizeStreamHealth(window, 2_500)

    expect(summary.freshness).toBe("fresh")
    expect(summary.sampleCount).toBe(2)
    expect(summary.rttMs.mean).toBe(25)
    expect(summary.lossFraction.mean).toBe(0.02)
    expect(summary.bitrateDeliveryRatio).toBe(0.9)
    expect(summary.fpsDeliveryRatio).toBe(0.9)
    expect(summary.framesDropped.delta).toBe(2)
    expect(summary.decodeTimeMs.mean).toBe(6)
    expect(summary.queueDepth.mean).toBe(2)
  })

  it("keeps a bounded ring and summarizes only retained samples", () => {
    const window = [
      sample(1, 1_000),
      sample(2, 2_000),
      sample(3, 3_000),
    ].reduce(
      ingestStreamHealthSample,
      createStreamHealthWindow({ maxSamples: 2 }),
    )

    expect(window.samples.map(s => s.seq)).toEqual([2, 3])
    expect(summarizeStreamHealth(window, 3_100).rttMs.mean).toBe(22.5)
  })

  it("returns no-data for an empty window", () => {
    const summary = summarizeStreamHealth(createStreamHealthWindow(), 1_000)

    expect(summary.freshness).toBe("no-data")
    expect(summary.sampleCount).toBe(0)
    expect(summary.rttMs.mean).toBeUndefined()
  })

  it("marks the summary stale when the latest sample is too old", () => {
    const window = ingestStreamHealthSample(
      createStreamHealthWindow({ staleAfterMs: 1_000 }),
      sample(1, 1_000),
    )

    expect(summarizeStreamHealth(window, 2_001).freshness).toBe("stale")
  })

  it("ignores absent optional counters instead of treating them as zero", () => {
    const window = [
      sample(1, 1_000, { decodeTimeMs: undefined, queueDepth: undefined }),
      sample(2, 2_000, { decodeTimeMs: 10, queueDepth: 4 }),
    ].reduce(ingestStreamHealthSample, createStreamHealthWindow())

    const summary = summarizeStreamHealth(window, 2_100)

    expect(summary.decodeTimeMs.mean).toBe(10)
    expect(summary.queueDepth.mean).toBe(4)
  })

  it("reports RTT trend across the retained window", () => {
    const rising = [
      sample(1, 1_000, { rttMs: 10 }),
      sample(2, 2_000, { rttMs: 20 }),
      sample(3, 3_000, { rttMs: 30 }),
    ].reduce(ingestStreamHealthSample, createStreamHealthWindow())

    const falling = [
      sample(1, 1_000, { rttMs: 30 }),
      sample(2, 2_000, { rttMs: 20 }),
      sample(3, 3_000, { rttMs: 10 }),
    ].reduce(ingestStreamHealthSample, createStreamHealthWindow())

    expect(summarizeStreamHealth(rising, 3_100).rttMs.trend).toBe("rising")
    expect(summarizeStreamHealth(falling, 3_100).rttMs.trend).toBe("falling")
  })
})
