import { describe, expect, it } from "bun:test"
import type { StreamControlSession } from "@platform/stream-control/stream-control-session"
import type { RuntimeRecoveryControlPort } from "./runtime-recovery-supervisor"
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

function makeRecoveryPort(): RuntimeRecoveryControlPort {
  const listeners: ((
    result: Parameters<RuntimeRecoveryControlPort["onResult"]>[0] extends (
      arg: infer R,
    ) => void
      ? R
      : never,
  ) => void)[] = []
  return {
    setBitrate: async () => "bitrate-1",
    setFps: async () => "fps-1",
    setResolution: async () => "resolution-1",
    onResult: listener => {
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
  }
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
      recoveryPort: makeRecoveryPort(),
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
      recoveryPort: makeRecoveryPort(),
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
        recoveryPort: makeRecoveryPort(),
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
      recoveryPort: makeRecoveryPort(),
      onRecoveryEvent: event => events.push(event),
    })

    expect(runtime.recovery?.knownGood()).toEqual({
      "runtime.setBitrate": { kind: "scalar", value: 20_000 },
      "runtime.setFps": { kind: "scalar", value: 60 },
      "runtime.setResolution": { kind: "resolution", width: 1280, height: 720 },
    })
  })
})
