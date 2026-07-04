import { describe, expect, it } from "bun:test"
import type { RuntimeRecoverySupervisor } from "./runtime-recovery-supervisor"
import { createStreamAdaptiveRunner } from "./stream-adaptive-runner"
import type { StreamHealthSummary } from "./stream-health"
import type { StreamHealthMonitor } from "./stream-health-monitor"

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

function makeHarness(
  input: {
    readonly health?: StreamHealthSummary
    readonly pending?: boolean
    readonly streaming?: boolean
    readonly enabled?: boolean
    readonly rejectSet?: boolean
  } = {},
) {
  const events: unknown[] = []
  const calls: string[] = []
  const monitor: StreamHealthMonitor = {
    latestSummary: () => input.health ?? summary(),
    close: () => calls.push("monitor.close"),
  }
  const recovery: RuntimeRecoverySupervisor = {
    setBitrate: async kbps => {
      calls.push(`bitrate:${kbps}`)
      if (input.rejectSet) throw new Error("dispatch failed")
    },
    setFps: async fps => {
      calls.push(`fps:${fps}`)
      if (input.rejectSet) throw new Error("dispatch failed")
    },
    setResolution: async (width, height) => {
      calls.push(`resolution:${width}x${height}`)
      if (input.rejectSet) throw new Error("dispatch failed")
    },
    hasPending: () => input.pending ?? false,
    knownGood: () => ({
      "runtime.setBitrate": { kind: "scalar", value: 20_000 },
      "runtime.setFps": { kind: "scalar", value: 60 },
      "runtime.setResolution": { kind: "resolution", width: 1280, height: 720 },
    }),
    close: () => calls.push("recovery.close"),
  }
  const runner = createStreamAdaptiveRunner({
    enabled: input.enabled ?? true,
    monitor,
    recovery,
    initialSettings: {
      bitrateKbps: 20_000,
      fps: 60,
      resolution: { width: 1280, height: 720 },
      baselineResolution: { width: 1920, height: 1080 },
    },
    objectiveBias: 0.5,
    isStreaming: () => input.streaming ?? true,
    nowMs: () => 1_500,
    onEvent: event => events.push(event),
  })
  return { runner, events, calls }
}

describe("createStreamAdaptiveRunner", () => {
  it("does not dispatch when disabled", async () => {
    const { runner, calls, events } = makeHarness({ enabled: false })

    await runner.tick()

    expect(calls).toEqual([])
    expect(events).toContainEqual({ kind: "dormant", reason: "disabled" })
  })

  it("does not dispatch when health is stale", async () => {
    const { runner, calls, events } = makeHarness({
      health: summary({ freshness: "stale" }),
    })

    await runner.tick()

    expect(calls).toEqual([])
    expect(events).toContainEqual({ kind: "dormant", reason: "stale" })
  })

  it("does not dispatch while a mutation is pending", async () => {
    const { runner, calls, events } = makeHarness({ pending: true })

    await runner.tick()

    expect(calls).toEqual([])
    expect(events).toContainEqual({ kind: "dormant", reason: "pending" })
  })

  it("does not dispatch when the session is not streaming", async () => {
    const { runner, calls, events } = makeHarness({ streaming: false })

    await runner.tick()

    expect(calls).toEqual([])
    expect(events).toContainEqual({ kind: "dormant", reason: "not-streaming" })
  })

  it("dispatches only bitrate first when multiple dimensions are targeted", async () => {
    const { runner, calls, events } = makeHarness({
      health: summary({
        bitrateDeliveryRatio: 0.65,
        lossFraction: numeric(0.06),
        rttMs: numeric(120, "rising"),
        queueDepth: numeric(8),
        decodeTimeMs: numeric(35),
        frameDropFraction: 0.12,
      }),
    })

    await runner.tick()

    expect(calls).toHaveLength(1)
    expect(calls[0]).toStartWith("bitrate:")
    expect(
      events.find(event => (event as { kind?: string }).kind === "dispatched"),
    ).toBeTruthy()
  })

  it("emits an error event when dispatch rejects", async () => {
    const { runner, events } = makeHarness({
      rejectSet: true,
      health: summary({ bitrateDeliveryRatio: 0.65 }),
    })

    await runner.tick()

    expect(events).toContainEqual({
      kind: "dispatch-failed",
      command: "runtime.setBitrate",
      message: "dispatch failed",
    })
  })

  it("ignores ticks after close", async () => {
    const { runner, calls, events } = makeHarness({
      health: summary({ bitrateDeliveryRatio: 0.65 }),
    })

    runner.close()
    await runner.tick()

    expect(calls).toEqual([])
    expect(events).toEqual([])
  })
})
