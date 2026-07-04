import { describe, expect, it } from "bun:test"
import { computeStreamAdaptiveDecision } from "./stream-adaptive-controller"
import type { StreamHealthSummary } from "./stream-health"

const numeric = (
  mean?: number,
  trend: "rising" | "falling" | "flat" | "unknown" = "flat",
) =>
  mean === undefined
    ? { trend: "unknown" as const }
    : { mean, variance: 0, trend }

function summary(
  overrides: Partial<StreamHealthSummary> = {},
): StreamHealthSummary {
  return {
    freshness: "fresh",
    sampleCount: 5,
    lastSampleAtMs: 5_000,
    rttMs: numeric(28),
    rttVarianceMs: numeric(2),
    lossFraction: numeric(0.001),
    decodeTimeMs: numeric(6),
    queueDepth: numeric(1),
    firstFrameMs: numeric(80),
    bitrateDeliveryRatio: 1,
    fpsDeliveryRatio: 1,
    framesDropped: {},
    frameDropFraction: 0,
    ...overrides,
  }
}

const current = {
  bitrateKbps: 20_000,
  fps: 60,
  resolution: { width: 1280, height: 720 },
  baselineResolution: { width: 1920, height: 1080 },
}

describe("computeStreamAdaptiveDecision", () => {
  it("stays dormant when health is stale or absent", () => {
    expect(
      computeStreamAdaptiveDecision({
        summary: summary({ freshness: "stale" }),
        current,
        objectiveBias: 0.5,
      }),
    ).toEqual({ kind: "dormant", reason: "stale" })

    expect(
      computeStreamAdaptiveDecision({
        summary: summary({ freshness: "no-data", sampleCount: 0 }),
        current,
        objectiveBias: 0.5,
      }),
    ).toEqual({ kind: "dormant", reason: "no-data" })
  })

  it("lowers bitrate first under delivery and loss pressure", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({
        bitrateDeliveryRatio: 0.7,
        lossFraction: numeric(0.04),
      }),
      current,
      objectiveBias: 0.5,
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.target.bitrateKbps).toBeLessThan(current.bitrateKbps)
    expect(decision.target.fps).toBeUndefined()
    expect(decision.target.resolution).toBeUndefined()
  })

  it("uses latency bias to propose FPS reduction under sustained RTT pressure", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({ rttMs: numeric(110, "rising") }),
      current,
      objectiveBias: 0.1,
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.target.fps).toBeLessThan(current.fps)
  })

  it("preserves quality under mild pressure when biased toward quality", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({ rttMs: numeric(70), bitrateDeliveryRatio: 0.92 }),
      current,
      objectiveBias: 0.9,
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.target.bitrateKbps).toBeLessThan(current.bitrateKbps)
    expect(decision.target.fps).toBeUndefined()
    expect(decision.target.resolution).toBeUndefined()
  })

  it("proposes same-aspect even resolution scale-down under decode pressure", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({
        queueDepth: numeric(8),
        decodeTimeMs: numeric(35),
        frameDropFraction: 0.12,
      }),
      current,
      objectiveBias: 0.5,
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.target.resolution).toBeDefined()
    const resolution = decision.target.resolution
    if (!resolution) throw new Error("missing resolution")
    expect(resolution.width % 2).toBe(0)
    expect(resolution.height % 2).toBe(0)
    expect(resolution.width / resolution.height).toBeCloseTo(16 / 9, 2)
    expect(resolution.width).toBeLessThan(current.resolution.width)
  })

  it("returns within-hysteresis when proposed changes are too small", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({
        bitrateDeliveryRatio: 0.985,
        lossFraction: numeric(0.002),
      }),
      current,
      objectiveBias: 0.5,
    })

    expect(decision).toEqual({ kind: "dormant", reason: "within-hysteresis" })
  })

  it("gradually raises bitrate when healthy and below baseline ceiling", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary(),
      current: { ...current, bitrateKbps: 8_000 },
      objectiveBias: 0.8,
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.target.bitrateKbps).toBeGreaterThan(8_000)
  })
})
