import { describe, expect, it } from "bun:test"
import {
  runStreamAdaptiveScenario,
  type StreamAdaptiveScenarioStep,
} from "./stream-adaptive-scenario"
import type { StreamHealthSummary } from "./stream-health"

const numeric = (mean?: number, trend: "rising" | "falling" | "flat" | "unknown" = "flat") =>
  mean === undefined ? { trend: "unknown" as const } : { mean, variance: 0, trend }

function summary(overrides: Partial<StreamHealthSummary> = {}): StreamHealthSummary {
  return {
    freshness: "fresh",
    sampleCount: 5,
    lastSampleAtMs: 1000,
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

const initial = {
  bitrateKbps: 20_000,
  fps: 60,
  resolution: { width: 1280, height: 720 },
  baselineResolution: { width: 1920, height: 1080 },
}

describe("stream adaptive scenario replay", () => {
  it("replays a cliff as fast shed followed by slow recovery", () => {
    const steps: StreamAdaptiveScenarioStep[] = [
      { summary: summary({ bitrateDeliveryRatio: 0.25, lossFraction: numeric(0.12, "rising"), rttMs: numeric(140, "rising") }) },
      { summary: summary() },
      { summary: summary() },
    ]

    const result = runStreamAdaptiveScenario({ initial, objectiveBias: 0.5, steps })

    expect(result[0]?.decision.kind).toBe("target")
    expect(result[0]?.mode).toBe("shed")
    expect(result[0]?.settings.bitrateKbps).toBeLessThan(20_000)
    expect(result.at(-1)?.settings.bitrateKbps).toBeLessThanOrEqual(20_000)
  })

  it("honors pins throughout a replay", () => {
    const result = runStreamAdaptiveScenario({
      initial,
      objectiveBias: 0.5,
      boundaries: {
        levers: { bitrate: { floor: 20_000, ceiling: 20_000, pinned: 20_000 } },
        outcomes: {},
        lean: 0.5,
      },
      steps: [{ summary: summary({ bitrateDeliveryRatio: 0.25, lossFraction: numeric(0.12) }) }],
    })

    expect(result[0]?.settings.bitrateKbps).toBe(20_000)
  })

  it("replays cold-start ramp", () => {
    const result = runStreamAdaptiveScenario({
      initial: { ...initial, bitrateKbps: 8_000 },
      objectiveBias: 0.8,
      phase: "establishing",
      boundaries: { levers: { bitrate: { ceiling: 20_000 } }, outcomes: {}, lean: 0.8 },
      steps: [
        { summary: summary({ sampleCount: 1 }) },
        { summary: summary({ sampleCount: 8 }) },
      ],
    })

    expect(result[0]?.mode).toBe("establish")
    expect(result[1]?.settings.bitrateKbps).toBeGreaterThan(8_000)
  })
})
