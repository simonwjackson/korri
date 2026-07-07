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
  it("sheds to manual-style rescue when health goes stale", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({ freshness: "stale" }),
      current,
      objectiveBias: 0.5,
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.mode).toBe("shed")
    expect(decision.target).toMatchObject({
      bitrateKbps: 500,
      fps: 30,
      resolution: { width: 640, height: 360 },
    })
  })

  it("stays dormant when health is absent", () => {
    expect(
      computeStreamAdaptiveDecision({
        summary: summary({ freshness: "no-data", sampleCount: 0 }),
        current,
        objectiveBias: 0.5,
      }),
    ).toEqual({ kind: "dormant", reason: "no-data" })
  })

  it("does not panic on pre-first-frame startup zero delivery", () => {
    expect(
      computeStreamAdaptiveDecision({
        summary: summary({
          sampleCount: 2,
          firstFrameMs: numeric(),
          bitrateDeliveryRatio: 0,
          fpsDeliveryRatio: 0,
        }),
        current,
        objectiveBias: 0.5,
      }),
    ).toEqual({ kind: "dormant", reason: "within-hysteresis" })
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

describe("computeStreamAdaptiveDecision boundary-box controller behavior", () => {
  it("clamps bitrate proposals to the boundary ceiling", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary(),
      current: { ...current, bitrateKbps: 10_000 },
      objectiveBias: 0.8,
      boundaries: {
        levers: { bitrate: { ceiling: 10_500 } },
        outcomes: {},
        lean: 0.8,
      },
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.target.bitrateKbps).toBe(10_500)
  })

  it("does not move pinned levers and adapts the remaining free levers", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({
        bitrateDeliveryRatio: 0.65,
        rttMs: numeric(120, "rising"),
      }),
      current,
      objectiveBias: 0.1,
      boundaries: {
        levers: { bitrate: { floor: 20_000, ceiling: 20_000, pinned: 20_000 } },
        outcomes: {},
        lean: 0,
      },
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.target.bitrateKbps).toBeUndefined()
    expect(decision.target.fps).toBeLessThan(current.fps)
  })

  it("defends a max-latency outcome clamp and reports it as binding", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({ rttMs: numeric(80) }),
      current,
      objectiveBias: 0.9,
      boundaries: {
        levers: {},
        outcomes: { maxLatencyMs: 50 },
        lean: 0.9,
      },
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.bindingConstraint).toBe("max-latency")
    expect(decision.target.bitrateKbps ?? decision.target.fps).toBeDefined()
  })

  it("recovers fps and resolution as well as bitrate when healthy", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary(),
      current: {
        ...current,
        bitrateKbps: 8_000,
        fps: 30,
        resolution: { width: 960, height: 540 },
      },
      objectiveBias: 0.8,
      boundaries: {
        levers: {
          bitrate: { ceiling: 20_000 },
          fps: { ceiling: 60 },
          resolution: { ceiling: { width: 1280, height: 720 } },
        },
        outcomes: {},
        lean: 0.8,
      },
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.target.bitrateKbps).toBeGreaterThan(8_000)
    expect(decision.target.fps).toBeGreaterThan(30)
    expect(decision.target.resolution?.width).toBeGreaterThan(960)
  })

  it("sheds hard during a cliff and marks the decision mode", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({
        bitrateDeliveryRatio: 0.25,
        lossFraction: numeric(0.12, "rising"),
        rttMs: numeric(140, "rising"),
        queueDepth: numeric(9, "rising"),
      }),
      current,
      objectiveBias: 0.5,
      boundaries: { levers: {}, outcomes: {}, lean: 0.5 },
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.mode).toBe("shed")
    expect(decision.target.bitrateKbps).toBeLessThan(12_000)
  })

  it("targets a playable emergency envelope during a shed", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({
        bitrateDeliveryRatio: 0.12,
        fpsDeliveryRatio: 0.2,
        rttMs: numeric(180, "rising"),
      }),
      current,
      objectiveBias: 0.8,
      boundaries: { levers: {}, outcomes: {}, lean: 0.8 },
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.mode).toBe("shed")
    expect(decision.target.bitrateKbps).toBe(500)
    expect(decision.target.fps).toBe(30)
    expect(decision.target.resolution).toEqual({ width: 640, height: 360 })
  })

  it("shrinks canvas when bits per pixel are starved and grows grudgingly after recovery", () => {
    const shrink = computeStreamAdaptiveDecision({
      summary: summary({ bitrateDeliveryRatio: 0.75 }),
      current: { ...current, bitrateKbps: 1_500 },
      objectiveBias: 0.8,
      boundaries: { levers: {}, outcomes: {}, lean: 0.8 },
    })

    expect(shrink.kind).toBe("target")
    if (shrink.kind !== "target") throw new Error("expected shrink")
    expect(shrink.target.resolution?.width).toBeLessThan(
      current.resolution.width,
    )

    const grow = computeStreamAdaptiveDecision({
      summary: summary(),
      current: {
        ...current,
        bitrateKbps: 20_000,
        resolution: { width: 960, height: 540 },
      },
      objectiveBias: 0.8,
      boundaries: {
        levers: { resolution: { ceiling: { width: 1280, height: 720 } } },
        outcomes: {},
        lean: 0.8,
      },
    })

    expect(grow.kind).toBe("target")
    if (grow.kind !== "target") throw new Error("expected grow")
    expect(grow.target.resolution?.width).toBeGreaterThan(960)
  })

  it("honors auto=off as an adaptive kill switch", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({
        bitrateDeliveryRatio: 0.25,
        lossFraction: numeric(0.12),
      }),
      current,
      objectiveBias: 0.5,
      boundaries: { levers: {}, outcomes: {}, auto: "off" },
    })

    expect(decision).toEqual({ kind: "dormant", reason: "within-hysteresis" })
  })

  it("uses min-fps as the FPS floor when it is feasible", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({ rttMs: numeric(140, "rising") }),
      current,
      objectiveBias: 0.1,
      boundaries: {
        levers: {},
        outcomes: { minDeliveredFps: 50 },
        lean: 0,
      },
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.target.fps).toBe(50)
    expect(decision.bindingConstraint).toBe("min-fps")
  })

  it("applies min-fps without violating the explicit FPS ceiling", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({ rttMs: numeric(140, "rising") }),
      current,
      objectiveBias: 0.1,
      boundaries: {
        levers: { fps: { ceiling: 30 } },
        outcomes: { minDeliveredFps: 60 },
        lean: 0,
      },
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.target.fps).toBe(30)
    expect(decision.bindingConstraint).toBe("min-fps")
  })

  it("lets cliff shedding override the establishing phase", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({
        sampleCount: 8,
        bitrateDeliveryRatio: 0.25,
        lossFraction: numeric(0.12, "rising"),
        rttMs: numeric(140, "rising"),
      }),
      current,
      objectiveBias: 0.8,
      phase: "establishing",
      boundaries: { levers: {}, outcomes: {}, lean: 0.8 },
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.mode).toBe("shed")
    expect(decision.target.bitrateKbps).toBeLessThan(current.bitrateKbps)
  })

  it("keeps emergency defaults within usable bitrate fps and resolution floors", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({
        bitrateDeliveryRatio: 0.05,
        rttMs: numeric(220, "rising"),
      }),
      current: {
        ...current,
        bitrateKbps: 500,
        fps: 30,
        resolution: { width: 640, height: 360 },
      },
      objectiveBias: 0.5,
      boundaries: { levers: {}, outcomes: {}, lean: 0.5 },
    })

    expect(decision).toEqual({ kind: "dormant", reason: "within-hysteresis" })
  })

  it("keeps off-aspect resolution boundaries projected onto the stream aspect", () => {
    const decision = computeStreamAdaptiveDecision({
      summary: summary({
        queueDepth: numeric(8),
        decodeTimeMs: numeric(35),
        frameDropFraction: 0.12,
      }),
      current,
      objectiveBias: 0.5,
      boundaries: {
        levers: { resolution: { floor: { width: 800, height: 600 } } },
        outcomes: {},
        lean: 0.5,
      },
    })

    expect(decision.kind).toBe("target")
    if (decision.kind !== "target") throw new Error("expected target")
    expect(decision.target.resolution?.width).toBeGreaterThanOrEqual(1066)
    expect(
      (decision.target.resolution?.width ?? 1) /
        (decision.target.resolution?.height ?? 1),
    ).toBeCloseTo(16 / 9, 2)
  })

  it("cold-starts conservatively then ramps once fresh samples arrive", () => {
    const establish = computeStreamAdaptiveDecision({
      summary: summary({ sampleCount: 1 }),
      current,
      objectiveBias: 0.8,
      phase: "establishing",
      boundaries: { levers: {}, outcomes: {}, lean: 0.8 },
    })

    expect(establish.kind).toBe("target")
    if (establish.kind !== "target")
      throw new Error("expected establish target")
    expect(establish.mode).toBe("establish")
    expect(establish.target.bitrateKbps).toBeLessThanOrEqual(
      current.bitrateKbps,
    )

    const ramp = computeStreamAdaptiveDecision({
      summary: summary({ sampleCount: 8 }),
      current: { ...current, bitrateKbps: 8_000 },
      objectiveBias: 0.8,
      phase: "establishing",
      boundaries: {
        levers: { bitrate: { ceiling: 20_000 } },
        outcomes: {},
        lean: 0.8,
      },
    })

    expect(ramp.kind).toBe("target")
    if (ramp.kind !== "target") throw new Error("expected ramp target")
    expect(ramp.mode).toBe("establish")
    expect(ramp.target.bitrateKbps).toBeGreaterThan(8_800)
  })
})
