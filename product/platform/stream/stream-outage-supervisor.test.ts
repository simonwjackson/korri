import { describe, expect, it } from "bun:test"
import { createStreamOutageSupervisor } from "./stream-outage-supervisor"

const base = {
  freshness: "fresh" as const,
  sampleCount: 5,
  bitrateDeliveryRatio: 1,
  fpsDeliveryRatio: 1,
  frameDropFraction: 0,
}

describe("stream outage supervisor", () => {
  it("enters hold after sustained zero throughput", () => {
    const events: unknown[] = []
    const supervisor = createStreamOutageSupervisor({ onEvent: event => events.push(event), lossAfterMs: 1000 })

    supervisor.observe(0, base)
    supervisor.observe(500, { ...base, bitrateDeliveryRatio: 0, fpsDeliveryRatio: 0 })
    supervisor.observe(1501, { ...base, bitrateDeliveryRatio: 0, fpsDeliveryRatio: 0 })

    expect(supervisor.state()).toBe("hold")
    expect(events).toContainEqual({ kind: "outage-detected" })
  })

  it("keeps brief dips in shed instead of loss", () => {
    const supervisor = createStreamOutageSupervisor({ onEvent: () => {}, lossAfterMs: 1000 })

    supervisor.observe(0, base)
    supervisor.observe(500, { ...base, bitrateDeliveryRatio: 0, fpsDeliveryRatio: 0 })
    supervisor.observe(900, { ...base, bitrateDeliveryRatio: 0.5, fpsDeliveryRatio: 0.5 })

    expect(supervisor.state()).toBe("connected")
  })

  it("resumes by requesting re-establish when signal returns", () => {
    const events: unknown[] = []
    const supervisor = createStreamOutageSupervisor({ onEvent: event => events.push(event), lossAfterMs: 1000 })

    supervisor.observe(0, { ...base, bitrateDeliveryRatio: 0, fpsDeliveryRatio: 0 })
    supervisor.observe(1200, { ...base, bitrateDeliveryRatio: 0, fpsDeliveryRatio: 0 })
    const action = supervisor.observe(1800, { ...base, bitrateDeliveryRatio: 0.8, fpsDeliveryRatio: 0.8 })

    expect(action).toEqual({ kind: "re-establish" })
    expect(supervisor.state()).toBe("reconnecting")
    expect(events).toContainEqual({ kind: "reconnecting" })
  })

  it("marks resumed once re-establish completes", () => {
    const events: unknown[] = []
    const supervisor = createStreamOutageSupervisor({ onEvent: event => events.push(event), lossAfterMs: 1000 })

    supervisor.observe(0, { ...base, bitrateDeliveryRatio: 0, fpsDeliveryRatio: 0 })
    supervisor.observe(1200, { ...base, bitrateDeliveryRatio: 0, fpsDeliveryRatio: 0 })
    supervisor.observe(1800, { ...base, bitrateDeliveryRatio: 0.8, fpsDeliveryRatio: 0.8 })
    supervisor.markReestablished()

    expect(supervisor.state()).toBe("connected")
    expect(events).toContainEqual({ kind: "resumed" })
  })
})
