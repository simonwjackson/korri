import { describe, expect, it } from "bun:test";
import type { StreamBoundaries } from "./stream-adaptive-boundaries";
import type { RuntimeRecoverySupervisor } from "./runtime-recovery-supervisor";
import { createStreamAdaptiveRunner } from "./stream-adaptive-runner";
import type { StreamHealthSummary } from "./stream-health";
import type { StreamHealthMonitor } from "./stream-health-monitor";

const numeric = (
  mean?: number,
  trend: "rising" | "falling" | "flat" | "unknown" = "flat",
) =>
  mean === undefined
    ? { trend: "unknown" as const }
    : { mean, variance: 0, trend };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  };
}

type KnownGood = ReturnType<RuntimeRecoverySupervisor["knownGood"]>;

function makeHarness(
  input: {
    readonly health?: StreamHealthSummary | (() => StreamHealthSummary);
    readonly pending?: boolean | (() => boolean);
    readonly streaming?: boolean | (() => boolean);
    readonly enabled?: boolean;
    readonly rejectSet?: boolean;
    readonly rejectWith?: unknown;
    readonly hangBitrate?: boolean;
    readonly knownGood?: () => KnownGood;
    readonly boundaries?:
      | StreamBoundaries
      | (() => StreamBoundaries | undefined);
  } = {},
) {
  const events: unknown[] = [];
  const calls: string[] = [];
  const monitor: StreamHealthMonitor = {
    latestSummary: () =>
      typeof input.health === "function"
        ? input.health()
        : (input.health ?? summary()),
    close: () => calls.push("monitor.close"),
  };
  const recovery: RuntimeRecoverySupervisor = {
    setBitrate: async (kbps) => {
      calls.push(`bitrate:${kbps}`);
      if (input.hangBitrate) await new Promise(() => {});
      if (input.rejectWith !== undefined) throw input.rejectWith;
      if (input.rejectSet) throw new Error("dispatch failed");
    },
    setFps: async (fps) => {
      calls.push(`fps:${fps}`);
      if (input.rejectWith !== undefined) throw input.rejectWith;
      if (input.rejectSet) throw new Error("dispatch failed");
    },
    setResolution: async (width, height) => {
      calls.push(`resolution:${width}x${height}`);
      if (input.rejectWith !== undefined) throw input.rejectWith;
      if (input.rejectSet) throw new Error("dispatch failed");
    },
    hasPending: () =>
      typeof input.pending === "function"
        ? input.pending()
        : (input.pending ?? false),
    knownGood: () =>
      input.knownGood?.() ?? {
        "runtime.setBitrate": { kind: "scalar", value: 20_000 },
        "runtime.setFps": { kind: "scalar", value: 60 },
        "runtime.setResolution": {
          kind: "resolution",
          width: 1280,
          height: 720,
        },
      },
    close: () => calls.push("recovery.close"),
  };
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
    boundaries: input.boundaries,
    isStreaming: () =>
      typeof input.streaming === "function"
        ? input.streaming()
        : (input.streaming ?? true),
    nowMs: () => 1_500,
    onEvent: (event) => events.push(event),
  });
  return { runner, events, calls };
}

describe("createStreamAdaptiveRunner", () => {
  it("does not dispatch when disabled", async () => {
    const { runner, calls, events } = makeHarness({ enabled: false });

    await runner.tick();

    expect(calls).toEqual([]);
    expect(events).toContainEqual({ kind: "dormant", reason: "disabled" });
  });

  it("dispatches the rescue burst when health is stale", async () => {
    const { runner, calls, events } = makeHarness({
      health: summary({ freshness: "stale" }),
    });

    await runner.tick();

    expect(calls).toEqual([
      "bitrate:500",
      "fps:30",
      "resolution:640x360",
      "bitrate:500",
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "decision", mode: "shed" }),
    );
  });

  it("downshifts early on corroborated health degradation", async () => {
    const { runner, calls, events } = makeHarness({
      health: summary({
        rttMs: numeric(86, "rising"),
        rttVarianceMs: numeric(30),
        bitrateDeliveryRatio: 0.8,
      }),
    });

    await runner.tick();

    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "early-downshift",
        reasonCode: "rtt-slope-delivery-drop",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "decision", mode: "shed" }),
    );
    expect(calls).toEqual([
      "bitrate:500",
      "fps:30",
      "resolution:640x360",
      "bitrate:500",
    ]);
  });

  it("does not bypass pending mutations for early downshift", async () => {
    const { runner, calls, events } = makeHarness({
      pending: true,
      health: summary({
        rttMs: numeric(86, "rising"),
        rttVarianceMs: numeric(30),
        bitrateDeliveryRatio: 0.8,
      }),
    });

    await runner.tick();

    expect(calls).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "early-downshift" }),
    );
    expect(events).toContainEqual({ kind: "dormant", reason: "pending" });
  });

  it("does not dispatch non-emergency changes while a mutation is pending", async () => {
    const { runner, calls, events } = makeHarness({
      pending: true,
      health: summary({ bitrateDeliveryRatio: 0.65, rttMs: numeric(70) }),
    });

    await runner.tick();

    expect(calls).toEqual([]);
    expect(events).toContainEqual({ kind: "dormant", reason: "pending" });
  });

  it("dispatches emergency rescue even while a mutation is pending", async () => {
    const { runner, calls, events } = makeHarness({
      pending: true,
      health: summary({ freshness: "stale" }),
    });

    await runner.tick();

    expect(calls).toEqual([
      "bitrate:500",
      "fps:30",
      "resolution:640x360",
      "bitrate:500",
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "decision", mode: "shed" }),
    );
  });

  it("does not let a slow bitrate response block FPS and resolution rescue", async () => {
    const { runner, calls } = makeHarness({
      hangBitrate: true,
      health: summary({ freshness: "stale" }),
    });

    const result = await Promise.race([
      runner.tick().then(() => "completed" as const),
      sleep(800).then(() => "timed-out" as const),
    ]);

    expect(result).toBe("completed");
    expect(calls).toEqual([
      "bitrate:500",
      "fps:30",
      "resolution:640x360",
      "bitrate:500",
    ]);
  });

  it("does not dispatch when the session is not streaming", async () => {
    const { runner, calls, events } = makeHarness({ streaming: false });

    await runner.tick();

    expect(calls).toEqual([]);
    expect(events).toContainEqual({ kind: "dormant", reason: "not-streaming" });
  });

  it("dispatches every survival target during shed mode", async () => {
    const { runner, calls, events } = makeHarness({
      health: summary({
        bitrateDeliveryRatio: 0.25,
        lossFraction: numeric(0.12, "rising"),
        rttMs: numeric(140, "rising"),
        queueDepth: numeric(9, "rising"),
        decodeTimeMs: numeric(35),
        frameDropFraction: 0.12,
      }),
    });

    await runner.tick();

    expect(calls.some((call) => call.startsWith("bitrate:"))).toBe(true);
    expect(calls.some((call) => call.startsWith("fps:"))).toBe(true);
    expect(calls.some((call) => call.startsWith("resolution:"))).toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "decision", mode: "shed" }),
    );
  });

  it("continues shed convergence after resolution-only rescue", async () => {
    let health = summary({
      bitrateDeliveryRatio: 0.25,
      lossFraction: numeric(0.12, "rising"),
      rttMs: numeric(140, "rising"),
      queueDepth: numeric(9, "rising"),
    });
    let knownGood: KnownGood = {
      "runtime.setBitrate": { kind: "scalar", value: 28_409 },
      "runtime.setFps": { kind: "scalar", value: 120 },
      "runtime.setResolution": {
        kind: "resolution",
        width: 1920,
        height: 1080,
      },
    };
    const { runner, calls, events } = makeHarness({
      health: () => health,
      knownGood: () => knownGood,
      boundaries: {
        levers: {
          bitrate: { floor: 500, startup: 6_000, ceiling: 40_000 },
          fps: { floor: 30, ceiling: 120 },
          resolution: {
            floor: { width: 640, height: 360 },
            ceiling: { width: 1920, height: 1080 },
          },
        },
        outcomes: {},
      },
    });

    await runner.tick();
    expect(calls).toEqual([
      "bitrate:500",
      "fps:30",
      "resolution:640x360",
      "bitrate:500",
    ]);

    calls.length = 0;
    health = summary({
      rttMs: numeric(30),
      bitrateDeliveryRatio: 1,
      fpsDeliveryRatio: 1,
      frameDropFraction: 0,
    });
    knownGood = {
      "runtime.setBitrate": { kind: "scalar", value: 28_409 },
      "runtime.setFps": { kind: "scalar", value: 120 },
      "runtime.setResolution": {
        kind: "resolution",
        width: 640,
        height: 360,
      },
    };

    await runner.tick();

    expect(calls).toContain("bitrate:500");
    expect(calls).toContain("fps:30");
    expect(calls).not.toContain("resolution:640x360");
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "shed-converging" }),
    );
    expect(events).not.toContainEqual({
      kind: "dormant",
      reason: "within-hysteresis",
    });
  });

  it("surfaces pending unresolved shed convergence without dispatching", async () => {
    let pending = false;
    let health = summary({ freshness: "stale" });
    let knownGood: KnownGood = {
      "runtime.setBitrate": { kind: "scalar", value: 28_409 },
      "runtime.setFps": { kind: "scalar", value: 120 },
      "runtime.setResolution": {
        kind: "resolution",
        width: 1920,
        height: 1080,
      },
    };
    const { runner, calls, events } = makeHarness({
      pending: () => pending,
      health: () => health,
      knownGood: () => knownGood,
      boundaries: {
        levers: {
          bitrate: { floor: 500, startup: 6_000, ceiling: 40_000 },
          fps: { floor: 30, ceiling: 120 },
          resolution: {
            floor: { width: 640, height: 360 },
            ceiling: { width: 1920, height: 1080 },
          },
        },
        outcomes: {},
      },
    });

    await runner.tick();

    calls.length = 0;
    events.length = 0;
    pending = true;
    health = summary({ rttMs: numeric(78), bitrateDeliveryRatio: 0.05 });
    knownGood = {
      "runtime.setBitrate": { kind: "scalar", value: 28_409 },
      "runtime.setFps": { kind: "scalar", value: 120 },
      "runtime.setResolution": {
        kind: "resolution",
        width: 640,
        height: 360,
      },
    };

    await runner.tick();

    expect(calls).toEqual([]);
    expect(events).toContainEqual({ kind: "dormant", reason: "pending" });
    expect(events.at(-1)).toMatchObject({
      kind: "shed-converging",
      unresolved: ["runtime.setBitrate", "runtime.setFps"],
    });
  });

  it("clears stale shed convergence when streaming stops", async () => {
    let streaming = true;
    let health = summary({ freshness: "stale" });
    let knownGood: KnownGood = {
      "runtime.setBitrate": { kind: "scalar", value: 20_000 },
      "runtime.setFps": { kind: "scalar", value: 60 },
      "runtime.setResolution": { kind: "resolution", width: 1280, height: 720 },
    };
    const { runner, calls } = makeHarness({
      streaming: () => streaming,
      health: () => health,
      knownGood: () => knownGood,
    });

    await runner.tick();
    expect(calls).toContain("bitrate:500");

    streaming = false;
    await runner.tick();

    calls.length = 0;
    streaming = true;
    health = summary();
    knownGood = {
      "runtime.setBitrate": { kind: "scalar", value: 20_000 },
      "runtime.setFps": { kind: "scalar", value: 60 },
      "runtime.setResolution": { kind: "resolution", width: 1280, height: 720 },
    };

    await runner.tick();

    expect(calls).not.toContain("bitrate:500");
    expect(calls).not.toContain("fps:30");
  });

  it("recomputes shed convergence when boundaries change", async () => {
    let boundaries: StreamBoundaries | undefined = { levers: {}, outcomes: {} };
    let health = summary({ freshness: "stale" });
    let knownGood: KnownGood = {
      "runtime.setBitrate": { kind: "scalar", value: 20_000 },
      "runtime.setFps": { kind: "scalar", value: 60 },
      "runtime.setResolution": { kind: "resolution", width: 1280, height: 720 },
    };
    const { runner, calls } = makeHarness({
      health: () => health,
      knownGood: () => knownGood,
      boundaries: () => boundaries,
    });

    await runner.tick();

    boundaries = {
      levers: {
        bitrate: { floor: 20_000, ceiling: 20_000, pinned: 20_000 },
        fps: { floor: 30, ceiling: 120 },
        resolution: {
          floor: { width: 800, height: 600 },
          ceiling: { width: 1920, height: 1080 },
        },
      },
      outcomes: { minDeliveredFps: 60 },
    };
    knownGood = {
      "runtime.setBitrate": { kind: "scalar", value: 20_000 },
      "runtime.setFps": { kind: "scalar", value: 120 },
      "runtime.setResolution": { kind: "resolution", width: 1280, height: 720 },
    };
    health = summary({ rttMs: numeric(80), bitrateDeliveryRatio: 0.05 });
    calls.length = 0;

    await runner.tick();

    expect(calls).not.toContain("bitrate:500");
    expect(calls).toContain("fps:60");
    expect(calls).toContain("resolution:1066x600");
  });

  it("clears transient shed convergence after stable healthy samples", async () => {
    let health = summary({
      bitrateDeliveryRatio: 0.25,
      lossFraction: numeric(0.12, "rising"),
      rttMs: numeric(140, "rising"),
    });
    let knownGood: KnownGood = {
      "runtime.setBitrate": { kind: "scalar", value: 20_000 },
      "runtime.setFps": { kind: "scalar", value: 60 },
      "runtime.setResolution": { kind: "resolution", width: 1280, height: 720 },
    };
    const { runner, calls } = makeHarness({
      health: () => health,
      knownGood: () => knownGood,
    });

    await runner.tick();
    expect(calls).toContain("bitrate:500");

    calls.length = 0;
    health = summary({ bitrateDeliveryRatio: 1, fpsDeliveryRatio: 1 });
    await runner.tick();
    await runner.tick();

    expect(calls).not.toContain("bitrate:500");
    expect(calls).not.toContain("fps:30");
  });

  it("emits an error event when dispatch rejects", async () => {
    const { runner, events } = makeHarness({
      rejectSet: true,
      health: summary({ bitrateDeliveryRatio: 0.65 }),
    });

    await runner.tick();

    expect(events).toContainEqual({
      kind: "dispatch-failed",
      command: "runtime.setBitrate",
      message: "dispatch failed",
    });
  });

  it("renders object dispatch failures as useful JSON", async () => {
    const { runner, events } = makeHarness({
      rejectWith: { status: "unsupported", reason: "native rejected bitrate" },
      health: summary({ bitrateDeliveryRatio: 0.65 }),
    });

    await runner.tick();

    expect(events).toContainEqual({
      kind: "dispatch-failed",
      command: "runtime.setBitrate",
      message: '{"status":"unsupported","reason":"native rejected bitrate"}',
    });
  });

  it("starts in establishing phase and uses bitrate startup", async () => {
    const { runner, calls, events } = makeHarness({
      health: summary({ sampleCount: 1 }),
      boundaries: {
        levers: { bitrate: { floor: 500, startup: 6_000, ceiling: 40_000 } },
        outcomes: {},
      },
    });

    await runner.tick();

    expect(calls).toContain("bitrate:6000");
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "decision", mode: "establish" }),
    );
  });

  it("uses steady mode after enough healthy startup samples", async () => {
    const { runner, calls, events } = makeHarness({
      health: summary({ sampleCount: 5 }),
      boundaries: {
        levers: { bitrate: { floor: 500, startup: 6_000, ceiling: 40_000 } },
        outcomes: {},
      },
    });

    await runner.tick();

    expect(calls).not.toContain("bitrate:6000");
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "decision", mode: "fine-tune" }),
    );
  });

  it("still serializes non-shed targets to one dimension per tick", async () => {
    const { runner, calls, events } = makeHarness({
      health: summary({ bitrateDeliveryRatio: 0.65, rttMs: numeric(70) }),
    });

    await runner.tick();

    expect(calls.some((call) => call.startsWith("bitrate:"))).toBe(true);
    expect(calls.some((call) => call.startsWith("fps:"))).toBe(false);
    expect(calls.some((call) => call.startsWith("resolution:"))).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "decision", mode: "fine-tune" }),
    );
  });

  it("reads boundaries dynamically before each dispatch", async () => {
    let boundaries: StreamBoundaries | undefined;
    const { runner, calls } = makeHarness({
      health: summary({
        bitrateDeliveryRatio: 0.25,
        lossFraction: numeric(0.12, "rising"),
      }),
      boundaries: () => boundaries,
    });

    boundaries = {
      levers: { bitrate: { floor: 20_000, ceiling: 20_000, pinned: 20_000 } },
      outcomes: {},
      lean: 0.5,
    };
    await runner.tick();
    expect(calls.some((call) => call.startsWith("bitrate:"))).toBe(false);

    boundaries = { levers: {}, outcomes: {}, lean: 0.5 };
    await runner.tick();
    expect(calls.some((call) => call.startsWith("bitrate:"))).toBe(true);
  });

  it("honors pinned boundaries before dispatch", async () => {
    const { runner, calls, events } = makeHarness({
      health: summary({
        bitrateDeliveryRatio: 0.25,
        lossFraction: numeric(0.12, "rising"),
      }),
      boundaries: {
        levers: { bitrate: { floor: 20_000, ceiling: 20_000, pinned: 20_000 } },
        outcomes: {},
        lean: 0.5,
      },
    });

    await runner.tick();

    expect(calls.some((call) => call.startsWith("bitrate:"))).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "decision", mode: "shed" }),
    );
  });

  it("ignores ticks after close", async () => {
    const { runner, calls, events } = makeHarness({
      health: summary({ bitrateDeliveryRatio: 0.65 }),
    });

    runner.close();
    await runner.tick();

    expect(calls).toEqual([]);
    expect(events).toEqual([]);
  });
});
