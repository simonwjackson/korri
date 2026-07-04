import { describe, expect, it } from "bun:test"
import type { MoonlightControlClient } from "../moonlight-control-client"
import {
  applyMoonlightStreamControl,
  describeMoonlightStreamControl,
  moonlightStreamControlCapabilities,
  normalizeMoonlightState,
} from "./handlers"

const PROVIDER = "@korri:moonlight" as const

function recordingClient(calls: unknown[]): MoonlightControlClient {
  const record =
    (method: string) =>
    (params?: unknown): Promise<never> => {
      calls.push({ method, ...(params !== undefined ? { params } : {}) })
      return Promise.resolve({
        result: { _tag: "command.accepted" },
        // biome-ignore lint/suspicious/noExplicitAny: minimal wire response for tests
      } as any)
    }
  return {
    // biome-ignore lint/suspicious/noExplicitAny: test double narrows wire types
    hello: record("hello") as any,
    state: () =>
      Promise.resolve({
        result: {
          _tag: "state.snapshot",
          runtimeSettings: {
            appliedBitrateKbps: 12_000,
            appliedFps: 60,
            appliedResolution: { width: 1920, height: 1080 },
          },
          streamQuality: {},
        },
        // biome-ignore lint/suspicious/noExplicitAny: minimal wire response
      } as any),
    // biome-ignore lint/suspicious/noExplicitAny: test double
    subscribe: record("subscribe") as any,
    // biome-ignore lint/suspicious/noExplicitAny: test double
    setBitrate: record("setBitrate") as any,
    // biome-ignore lint/suspicious/noExplicitAny: test double
    setFps: record("setFps") as any,
    // biome-ignore lint/suspicious/noExplicitAny: test double
    setResolution: record("setResolution") as any,
    // biome-ignore lint/suspicious/noExplicitAny: test double
    setTouchBounds: record("setTouchBounds") as any,
    onEvent: () => () => {},
    close: () => calls.push({ method: "close" }),
  }
}

describe("moonlight stream-control handlers", () => {
  it("contributes provider-tagged bitrate/fps/resolution controls", () => {
    const controls = moonlightStreamControlCapabilities({
      provider: PROVIDER,
      enabled: true,
    })

    expect(controls.map(control => control.id)).toEqual([
      `${PROVIDER}/bitrate`,
      `${PROVIDER}/fps`,
      `${PROVIDER}/resolution`,
    ])
    expect(controls.map(control => control.action)).toEqual([
      `${PROVIDER}/bitrate.set`,
      `${PROVIDER}/fps.set`,
      `${PROVIDER}/resolution.set`,
    ])
    expect(controls.every(control => control.status === "supported")).toBe(true)
  })

  it("marks controls unsupported when the socket is disabled", () => {
    const controls = moonlightStreamControlCapabilities({
      provider: PROVIDER,
      enabled: false,
    })
    expect(controls.every(control => control.status === "unsupported")).toBe(
      true,
    )
  })

  it("applies bitrate/fps/resolution through the control client and closes it", async () => {
    const calls: unknown[] = []
    const connect = async () => recordingClient(calls)

    await applyMoonlightStreamControl({
      provider: PROVIDER,
      action: `${PROVIDER}/bitrate.set`,
      payload: { bitrateKbps: 12_000 },
      socketPath: "/run/m.sock",
      connect,
    })
    await applyMoonlightStreamControl({
      provider: PROVIDER,
      action: `${PROVIDER}/resolution.set`,
      payload: { width: 1920, height: 1080 },
      socketPath: "/run/m.sock",
      connect,
    })

    expect(calls).toEqual([
      { method: "setBitrate", params: { bitrateKbps: 12_000 } },
      { method: "close" },
      { method: "setResolution", params: { width: 1920, height: 1080 } },
      { method: "close" },
    ])
  })

  it("rejects invalid payloads and unsupported actions before touching the socket", async () => {
    const calls: unknown[] = []
    const connect = async () => recordingClient(calls)

    await expect(
      applyMoonlightStreamControl({
        provider: PROVIDER,
        action: `${PROVIDER}/bitrate.set`,
        payload: { bitrateKbps: 0 },
        socketPath: "/run/m.sock",
        connect,
      }),
    ).rejects.toThrow(/positive number/)
    await expect(
      applyMoonlightStreamControl({
        provider: PROVIDER,
        action: `${PROVIDER}/volume.set`,
        payload: { volume: 5 },
        socketPath: "/run/m.sock",
        connect,
      }),
    ).rejects.toThrow(/unsupported action/)
    expect(calls.filter(call => !isClose(call))).toEqual([])
  })

  it("fails closed when no socket is configured", async () => {
    await expect(
      applyMoonlightStreamControl({
        provider: PROVIDER,
        action: `${PROVIDER}/bitrate.set`,
        payload: { bitrateKbps: 12_000 },
      }),
    ).rejects.toThrow(/socket disabled/)
  })

  it("describes config, controls, and normalized state readback", async () => {
    const calls: unknown[] = []
    const description = await describeMoonlightStreamControl({
      provider: PROVIDER,
      socketPath: "/run/m.sock",
      connect: async () => recordingClient(calls),
    })

    expect(description.config).toEqual({ enabled: true })
    expect(description.controls).toHaveLength(3)
    expect(description.state).toEqual({
      status: "ok",
      readback: {
        bitrate: 12_000,
        fps: 60,
        resolution: { width: 1920, height: 1080 },
      },
    })
  })

  it("describes a disabled state without a socket", async () => {
    const description = await describeMoonlightStreamControl({
      provider: PROVIDER,
    })
    expect(description.config).toEqual({ enabled: false })
    expect(description.state).toEqual({ status: "disabled" })
  })

  it("normalizes applied-truth over stream-quality fallbacks", () => {
    expect(
      normalizeMoonlightState({
        result: {
          runtimeSettings: { appliedFps: 90 },
          streamQuality: { bitrateKbps: 8_000, fps: 60 },
        },
      }),
    ).toEqual({
      bitrate: 8_000,
      fps: 90,
      resolution: null,
    })
  })
})

function isClose(call: unknown): boolean {
  return (
    typeof call === "object" &&
    call !== null &&
    (call as { method?: string }).method === "close"
  )
}
