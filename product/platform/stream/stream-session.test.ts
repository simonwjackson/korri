import { describe, expect, it } from "bun:test"
import type { StreamControlSession } from "@platform/stream-control/stream-control-session"
import type { RuntimeRecoveryControlPort } from "./runtime-recovery-supervisor"
import type { StreamAdaptiveRunnerEvent } from "./stream-adaptive-runner"
import {
  createActiveStreamControlSessionRegistry,
  type StreamRuntimeSettings,
  startStreamRuntimeSession,
} from "./stream-session"

function makeSession(options: { readonly failSubscribe?: boolean } = {}) {
  const calls: string[] = []
  const listeners: ((delivery: { seq: number; event: unknown }) => void)[] = []
  const session: StreamControlSession = {
    hello: async () => {
      calls.push("hello")
      return { _tag: "protocol.hello" }
    },
    state: async () => {
      calls.push("state")
      return { _tag: "state.snapshot", runtimeSettings: {} }
    },
    subscribe: async () => {
      calls.push("subscribe")
      if (options.failSubscribe) throw new Error("subscribe failed")
      return { _tag: "events.subscribed" }
    },
    setBitrate: async () => ({}),
    setFps: async () => ({}),
    setResolution: async () => ({}),
    setTouchBounds: async () => ({}),
    onEvent: listener => {
      calls.push("onEvent")
      listeners.push(listener)
      return () => {
        calls.push("unsubscribe")
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
    close: () => calls.push("close"),
  }
  return {
    session,
    calls,
    emit: (event: unknown) => {
      for (const listener of [...listeners]) listener({ seq: 1, event })
    },
  }
}

function makeRecoveryPort() {
  const calls: string[] = []
  const listeners: ((
    result: Parameters<RuntimeRecoveryControlPort["onResult"]>[0] extends (
      arg: infer R,
    ) => void
      ? R
      : never,
  ) => void)[] = []
  const port: RuntimeRecoveryControlPort = {
    setBitrate: async ({ bitrateKbps }) => {
      calls.push(`bitrate:${bitrateKbps}`)
      return "bitrate-1"
    },
    setFps: async ({ fps }) => {
      calls.push(`fps:${fps}`)
      return "fps-1"
    },
    setResolution: async ({ width, height }) => {
      calls.push(`resolution:${width}x${height}`)
      return "resolution-1"
    },
    onResult: listener => {
      listeners.push(listener)
      return () => {
        calls.push("recovery.unsubscribe")
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
  }
  return { port, calls }
}

const settings: StreamRuntimeSettings = {
  bitrateKbps: 20_000,
  fps: 60,
  resolution: { width: 1280, height: 720 },
  baselineResolution: { width: 1920, height: 1080 },
}

describe("active stream-control session registry", () => {
  it("registers, replaces, and unregisters the active session", () => {
    const closed: string[] = []
    const registry = createActiveStreamControlSessionRegistry()

    registry.register({
      sessionId: "a",
      socketPath: "/run/a.sock",
      close: () => closed.push("a"),
    })
    expect(registry.current()?.socketPath).toBe("/run/a.sock")

    registry.register({
      sessionId: "b",
      socketPath: "/run/b.sock",
      close: () => closed.push("b"),
    })
    expect(closed).toEqual(["a"])
    expect(registry.current()?.sessionId).toBe("b")

    registry.unregister("a")
    expect(registry.current()?.sessionId).toBe("b")
    registry.unregister("b")
    expect(closed).toEqual(["a", "b"])
    expect(registry.current()).toBeUndefined()
  })
})

describe("startStreamRuntimeSession", () => {
  it("performs hello/state/subscribe before starting health and recovery", async () => {
    const harness = makeSession()
    const events: unknown[] = []
    const runtime = await startStreamRuntimeSession({
      session: harness.session,
      settingsFromState: () => settings,
      recoveryPort: makeRecoveryPort().port,
      onRecoveryEvent: event => events.push(event),
    })

    expect(harness.calls.slice(0, 3)).toEqual(["hello", "state", "subscribe"])
    expect(runtime.health.latestSummary(1_000).freshness).toBe("no-data")
    runtime.close()
    expect(harness.calls).toContain("close")
  })

  it("ingests quality samples after subscription", async () => {
    const harness = makeSession()
    const runtime = await startStreamRuntimeSession({
      session: harness.session,
      settingsFromState: () => settings,
      recoveryPort: makeRecoveryPort().port,
      onRecoveryEvent: () => {},
    })

    harness.emit({
      name: "quality.sample",
      sample: { seq: 1, sampledAtMs: 1, rttMs: 20 },
    })

    expect(runtime.health.latestSummary(Date.now()).rttMs.mean).toBe(20)
    runtime.close()
  })

  it("closes the session if subscribe fails", async () => {
    const harness = makeSession({ failSubscribe: true })

    await expect(
      startStreamRuntimeSession({
        session: harness.session,
        settingsFromState: () => settings,
        recoveryPort: makeRecoveryPort().port,
        onRecoveryEvent: () => {},
      }),
    ).rejects.toThrow("subscribe failed")

    expect(harness.calls).toContain("close")
  })

  it("seeds recovery from applied settings", async () => {
    const harness = makeSession()
    const events: unknown[] = []
    const runtime = await startStreamRuntimeSession({
      session: harness.session,
      settingsFromState: () => settings,
      recoveryPort: makeRecoveryPort().port,
      onRecoveryEvent: event => events.push(event),
    })

    expect(runtime.recovery?.knownGood()).toEqual({
      "runtime.setBitrate": { kind: "scalar", value: 20_000 },
      "runtime.setFps": { kind: "scalar", value: 60 },
      "runtime.setResolution": { kind: "resolution", width: 1280, height: 720 },
    })
    runtime.close()
  })

  it("starts the adaptive runner only when recovery and complete baseline are ready", async () => {
    const harness = makeSession()
    const recovery = makeRecoveryPort()
    const adaptiveEvents: StreamAdaptiveRunnerEvent[] = []
    const runtime = await startStreamRuntimeSession({
      session: harness.session,
      settingsFromState: () => settings,
      recoveryPort: recovery.port,
      onRecoveryEvent: () => {},
      adaptive: {
        enabled: true,
        objectiveBias: 0.5,
        isStreaming: () => true,
        onEvent: event => adaptiveEvents.push(event),
      },
    })

    harness.emit({
      name: "quality.sample",
      sample: {
        seq: 1,
        sampledAtMs: 1_000,
        rttMs: 120,
        incomingBitrateKbps: 8_000,
        requestedBitrateKbps: 20_000,
      },
    })

    await runtime.adaptive?.tick()

    expect(recovery.calls[0]).toMatch(/^bitrate:/)
    expect(adaptiveEvents).toContainEqual(
      expect.objectContaining({
        kind: "dispatched",
        command: "runtime.setBitrate",
      }),
    )
    runtime.close()
    expect(recovery.calls).toContain("recovery.unsubscribe")
  })

  it("exposes live adaptive boundary control and dry-run decisions", async () => {
    const harness = makeSession()
    const recovery = makeRecoveryPort()
    const adaptiveEvents: StreamAdaptiveRunnerEvent[] = []
    const runtime = await startStreamRuntimeSession({
      session: harness.session,
      settingsFromState: () => settings,
      recoveryPort: recovery.port,
      onRecoveryEvent: () => {},
      adaptive: {
        enabled: true,
        objectiveBias: 0.5,
        isStreaming: () => true,
        onEvent: event => adaptiveEvents.push(event),
      },
      nowMs: () => 2_000,
    })

    harness.emit({
      name: "quality.sample",
      sample: {
        seq: 1,
        sampledAtMs: 1_000,
        rttMs: 120,
        incomingBitrateKbps: 5_000,
        requestedBitrateKbps: 20_000,
      },
    })

    runtime.adaptiveControl?.setBoundaries({
      levers: { bitrate: { floor: 20_000, ceiling: 20_000, pinned: 20_000 } },
      outcomes: {},
      lean: 0.5,
    })
    await runtime.adaptive?.tick()
    expect(recovery.calls.some(call => call.startsWith("bitrate:"))).toBe(false)

    const dryRun = runtime.adaptiveControl?.dryRun()
    expect(dryRun?.kind).toBe("dormant")
    expect(runtime.adaptiveControl?.snapshot().boundaries?.levers.bitrate).toEqual({
      floor: 20_000,
      ceiling: 20_000,
      pinned: 20_000,
    })

    runtime.close()
  })

  it("does not start adaptive control without a recovery port", async () => {
    const harness = makeSession()
    const adaptiveEvents: StreamAdaptiveRunnerEvent[] = []

    const runtime = await startStreamRuntimeSession({
      session: harness.session,
      settingsFromState: () => settings,
      adaptive: {
        enabled: true,
        objectiveBias: 0.5,
        isStreaming: () => true,
        onEvent: event => adaptiveEvents.push(event),
      },
    })

    expect(runtime.adaptive).toBeUndefined()
    expect(adaptiveEvents).toEqual([{ kind: "dormant", reason: "not-ready" }])
    runtime.close()
  })
})
