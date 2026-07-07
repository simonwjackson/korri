import { describe, expect, it } from "bun:test"
import type { StreamHealthSummary } from "./stream-health"
import {
  detectEarlyStreamDownshift,
  normalizeHandoffTrigger,
} from "./stream-handoff-trigger"

const numeric = (
  mean?: number,
  trend: "rising" | "falling" | "flat" | "unknown" = "flat",
) =>
  mean === undefined
    ? { trend: "unknown" as const }
    : { mean, variance: 0, trend }

function summary(overrides: Partial<StreamHealthSummary> = {}): StreamHealthSummary {
  return {
    freshness: "fresh",
    sampleCount: 5,
    lastSampleAtMs: 1_000,
    rttMs: numeric(30),
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

describe("stream handoff trigger", () => {
  it("triggers early downshift from health evidence without a hint", () => {
    const decision = detectEarlyStreamDownshift(
      summary({
        rttMs: numeric(86, "rising"),
        bitrateDeliveryRatio: 0.8,
        rttVarianceMs: numeric(30),
      }),
    )

    expect(decision.kind).toBe("triggered")
    expect(decision).toMatchObject({
      reasonCode: "rtt-slope-delivery-drop",
      hintRole: "none",
    })
  })

  it("ignores route hints while stream health is good", () => {
    const hint = normalizeHandoffTrigger({ handoffInProgress: true })
    const decision = detectEarlyStreamDownshift(summary(), hint)

    expect(decision.kind).toBe("ignored")
    expect(decision).toMatchObject({
      reasonCode: "hint-without-health-evidence",
      hintRole: "context-only",
    })
  })

  it("lets a hint corroborate mild health degradation", () => {
    const hint = normalizeHandoffTrigger({ signalPercent: 12 })
    const decision = detectEarlyStreamDownshift(
      summary({ rttMs: numeric(68, "rising"), bitrateDeliveryRatio: 0.92 }),
      hint,
    )

    expect(decision.kind).toBe("triggered")
    expect(decision).toMatchObject({
      reasonCode: "hint-corroborated",
      hintRole: "corroborating",
    })
  })
})
