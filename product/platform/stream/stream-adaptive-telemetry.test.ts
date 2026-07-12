import { describe, expect, it } from "bun:test"
import {
  createStreamAdaptiveTelemetryRecorder,
  parseStreamAdaptiveTrace,
} from "./stream-adaptive-telemetry"

const entry = (tick: number) => ({
  tMs: tick * 1000,
  summary: { freshness: "fresh" as const, sampleCount: tick },
  decision: { kind: "dormant" as const, reason: "within-hysteresis" as const },
  boundaries: { levers: {}, outcomes: {}, lean: 0.5 },
})

describe("stream adaptive telemetry", () => {
  it("records ordered bounded entries", () => {
    const recorder = createStreamAdaptiveTelemetryRecorder({ maxEntries: 2 })
    recorder.record(entry(1))
    recorder.record(entry(2))
    recorder.record(entry(3))

    expect(recorder.entries().map(e => e.tMs)).toEqual([2000, 3000])
  })

  it("is cheap when disabled", () => {
    const recorder = createStreamAdaptiveTelemetryRecorder({ enabled: false })
    recorder.record(entry(1))

    expect(recorder.entries()).toEqual([])
    expect(recorder.exportJsonl()).toBe("")
  })

  it("exports and parses jsonl for replay", () => {
    const recorder = createStreamAdaptiveTelemetryRecorder()
    recorder.record(entry(1))
    recorder.record(entry(2))

    expect(
      parseStreamAdaptiveTrace(recorder.exportJsonl()).map(e => e.tMs),
    ).toEqual([1000, 2000])
  })
})
