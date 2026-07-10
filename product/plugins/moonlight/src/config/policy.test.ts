import { describe, expect, it } from "bun:test"
import {
  decodeMoonlightPolicy,
  moonlightStreamBoundaries,
} from "./policy"

describe("decodeMoonlightPolicy", () => {
  it("decodes a valid typed Moonlight policy", () => {
    const policy = decodeMoonlightPolicy({
      command: "moonlight",
      stream: {
        resolution: { width: 1920, height: 1080 },
        fps: 60,
        bitrateKbps: 12_000,
        codec: "h265",
      },
      input: { devices: ["/dev/input/event10"], rotate: 90 },
      control: { enable: true, authority: "controller" },
      extraArgs: ["-verbose"],
    })

    expect(policy.stream?.codec).toBe("h265")
    expect(policy.control?.authority).toBe("controller")
    expect(policy.input?.devices).toEqual(["/dev/input/event10"])
    expect(moonlightStreamBoundaries(policy)).toMatchObject({
      levers: {
        resolution: {
          floor: { width: 1920, height: 1080 },
          pinned: { width: 1920, height: 1080 },
          ceiling: { width: 1920, height: 1080 },
        },
        fps: { floor: 60, ceiling: 60, pinned: 60 },
        bitrate: { floor: 12_000, ceiling: 12_000, pinned: 12_000 },
      },
    })
  })

  it("decodes unified Moonlight stream ranges with start", () => {
    const policy = decodeMoonlightPolicy({
      stream: {
        resolution: {
          min: { width: 640, height: 360 },
          start: { width: 1280, height: 720 },
          max: { width: 1920, height: 1080 },
        },
        fps: { min: 60, start: 120, max: 120 },
        bitrateKbps: { min: 500, start: 6000, max: 40000 },
      },
    })

    expect(policy.stream?.resolution).toMatchObject({
      start: { width: 1280, height: 720 },
    })
    expect(moonlightStreamBoundaries(policy)).toEqual({
      levers: {
        resolution: {
          floor: { width: 640, height: 360 },
          ceiling: { width: 1920, height: 1080 },
        },
        fps: { floor: 60, ceiling: 120 },
        bitrate: { floor: 500, startup: 6000, ceiling: 40000 },
      },
      outcomes: {},
    })
  })

  it("rejects invalid unified stream ranges", () => {
    expect(() =>
      decodeMoonlightPolicy({ stream: { bitrateKbps: { min: 500, max: 40000 } } }),
    ).toThrow(/start/)
    expect(() =>
      decodeMoonlightPolicy({ stream: { fps: { min: 120, start: 60, max: 120 } } }),
    ).toThrow(/start.*min|min.*start/)
    expect(() =>
      decodeMoonlightPolicy({
        stream: {
          resolution: {
            min: { width: 640, height: 360 },
            max: { width: 1920, height: 1080 },
          },
        },
      }),
    ).toThrow(/start/)
    expect(() =>
      decodeMoonlightPolicy({
        stream: {
          resolution: {
            start: { width: 1280 },
          },
        },
      }),
    ).toThrow(/width and height|height/)
  })

  it("rejects retired Moonlight launch-policy vocabulary (now the plugin's job)", () => {
    const retired = [
      { KORRI_MOONLIGHT_COMMAND: "/bin/moonlight" },
      { KORRI_MOONLIGHT_PLATFORM: "v4l2m2m" },
      { action: "stream" },
      { app: { name: "Korri Stream", host: "aka.local" } },
      { config: { load: "/tmp/moonlight.conf", save: true } },
      { stream: { resolution: { preset: "720" } } },
      { platform: { source: "nixos" } },
      { input: { requireInputPlumber: true } },
      { control: { commands: { setBitrate: true } } },
      { control: { runtimeDir: "/run/korri/moonlight" } },
      { runtimeSettings: { oneShot: { enable: true } } },
    ]

    for (const policy of retired) {
      expect(() => decodeMoonlightPolicy(policy)).toThrow()
    }
  })

  it("rejects invalid codec and rotation values", () => {
    expect(() =>
      decodeMoonlightPolicy({ stream: { codec: "av1" } }),
    ).toThrow()
    expect(() => decodeMoonlightPolicy({ input: { rotate: 45 } })).toThrow()
  })
})
