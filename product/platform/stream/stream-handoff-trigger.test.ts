import { describe, expect, it } from "bun:test"
import { handoffHintPressure, normalizeHandoffTrigger } from "./stream-handoff-trigger"

describe("stream handoff trigger", () => {
  it("normalizes weak signal and handoff cues into a collapse hint", () => {
    expect(normalizeHandoffTrigger({ signalPercent: 15 })).toEqual({ kind: "collapse-likely", severity: 0.7 })
    expect(normalizeHandoffTrigger({ handoffInProgress: true })).toEqual({ kind: "collapse-likely", severity: 1 })
  })

  it("returns no hint for healthy or absent signals", () => {
    expect(normalizeHandoffTrigger()).toBeUndefined()
    expect(normalizeHandoffTrigger({ signalPercent: 80 })).toBeUndefined()
  })

  it("maps a hint to pressure without pretending it measures capacity", () => {
    expect(handoffHintPressure({ kind: "collapse-likely", severity: 0.5 })).toEqual({
      bandwidth: 0.25,
      latency: 0.25,
      decode: 0,
    })
  })
})
