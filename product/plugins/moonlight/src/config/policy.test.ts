import { describe, expect, it } from "bun:test"
import { decodeMoonlightPolicy } from "./policy"

describe("decodeMoonlightPolicy", () => {
  it("decodes a valid typed Moonlight policy", () => {
    const policy = decodeMoonlightPolicy({
      command: "moonlight",
      stream: { resolution: { width: 1920, height: 1080 }, fps: 60, codec: "h265" },
      input: { devices: ["/dev/input/event10"], rotate: 90 },
      control: { enable: true, authority: "controller" },
      adaptive: {
        boundaries: ["auto=on", "resolution=640x360..1920x1080", "fps=120"],
      },
      extraArgs: ["-verbose"],
    })

    expect(policy.stream?.codec).toBe("h265")
    expect(policy.control?.authority).toBe("controller")
    expect(policy.input?.devices).toEqual(["/dev/input/event10"])
    expect(policy.adaptive?.boundaries).toEqual([
      "auto=on",
      "resolution=640x360..1920x1080",
      "fps=120",
    ])
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
