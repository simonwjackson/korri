import { describe, expect, it } from "bun:test"
import type {
  MoonlightControlClient,
  MoonlightControlEventDelivery,
} from "../moonlight-control-client"
import type { MoonlightControlSuccessResponse } from "../moonlight-control-protocol"
import {
  moonlightRuntimeSettingsFromState,
  startMoonlightStreamRuntimeSession,
} from "./runtime-session"

function success(result: unknown): MoonlightControlSuccessResponse {
  return { jsonrpc: "2.0", id: "1", result } as MoonlightControlSuccessResponse
}

function clientDouble(calls: unknown[]): MoonlightControlClient {
  const listeners: ((delivery: MoonlightControlEventDelivery) => void)[] = []
  return {
    hello: async () => {
      calls.push("hello")
      return success({ _tag: "protocol.hello" })
    },
    state: async () => {
      calls.push("state")
      return success({
        _tag: "state.snapshot",
        runtimeSettings: {
          appliedBitrateKbps: 20_000,
          appliedFps: 60,
          appliedResolution: { width: 1920, height: 1080 },
        },
      })
    },
    subscribe: async () => {
      calls.push("subscribe")
      return success({ _tag: "events.subscribed", seq: 0 })
    },
    setBitrate: async params => {
      calls.push({ method: "setBitrate", params })
      return success({
        _tag: "command.accepted",
        requestId: "bitrate-1",
        command: "runtime.setBitrate",
      })
    },
    setFps: async params => {
      calls.push({ method: "setFps", params })
      return success({
        _tag: "command.accepted",
        requestId: "fps-1",
        command: "runtime.setFps",
      })
    },
    setResolution: async params => {
      calls.push({ method: "setResolution", params })
      return success({
        _tag: "command.accepted",
        requestId: "resolution-1",
        command: "runtime.setResolution",
      })
    },
    setTouchBounds: async params => {
      calls.push({ method: "setTouchBounds", params })
      return success({
        _tag: "input.command.accepted",
        requestId: "touch-1",
        command: "input.setTouchBounds",
      })
    },
    onEvent: listener => {
      calls.push("onEvent")
      listeners.push(listener)
      return () => calls.push("unsubscribe")
    },
    close: () => calls.push("close"),
  }
}

describe("moonlightRuntimeSettingsFromState", () => {
  it("extracts applied runtime settings from a decoded state response", () => {
    expect(
      moonlightRuntimeSettingsFromState(
        success({
          _tag: "state.snapshot",
          runtimeSettings: {
            appliedBitrateKbps: 18_000,
            appliedFps: 60,
            appliedResolution: { width: 1280, height: 720 },
          },
        }),
      ),
    ).toEqual({
      bitrateKbps: 18_000,
      fps: 60,
      resolution: { width: 1280, height: 720 },
      baselineResolution: { width: 1280, height: 720 },
    })
  })

  it("falls back to streamQuality when applied runtime settings are absent", () => {
    expect(
      moonlightRuntimeSettingsFromState({
        streamQuality: {
          bitrateKbps: 16_000,
          fps: 50,
          width: 1600,
          height: 900,
        },
      }),
    ).toEqual({
      bitrateKbps: 16_000,
      fps: 50,
      resolution: { width: 1600, height: 900 },
      baselineResolution: { width: 1600, height: 900 },
    })
  })
})

describe("startMoonlightStreamRuntimeSession", () => {
  it("connects the active socket and starts health plus recovery on one subscribed client", async () => {
    const calls: unknown[] = []
    const runtime = await startMoonlightStreamRuntimeSession({
      socketPath: "/run/korri/control.sock",
      connect: async input => {
        calls.push({ connect: input.socketPath })
        return clientDouble(calls)
      },
      onRecoveryEvent: event => calls.push({ recovery: event }),
    })

    expect(calls.slice(0, 4)).toEqual([
      { connect: "/run/korri/control.sock" },
      "hello",
      "state",
      "subscribe",
    ])
    expect(runtime.recovery?.knownGood()).toEqual({
      "runtime.setBitrate": { kind: "scalar", value: 20_000 },
      "runtime.setFps": { kind: "scalar", value: 60 },
      "runtime.setResolution": {
        kind: "resolution",
        width: 1920,
        height: 1080,
      },
    })

    runtime.close()
    expect(calls).toContain("unsubscribe")
    expect(calls).toContain("close")
  })
})
