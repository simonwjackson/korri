import { describe, expect, it } from "bun:test"

import { decodeAppPayload } from "./app"

describe("AppPayload", () => {
  it("decodes apps.retroarch.settings without requiring command boilerplate", () => {
    expect(
      decodeAppPayload({
        settings: {
          video_driver: "glcore",
          config_save_on_exit: false,
        },
      }),
    ).toEqual({
      settings: {
        video_driver: "glcore",
        config_save_on_exit: false,
      },
    })
  })

  it("decodes a custom process app with command and args", () => {
    expect(
      decodeAppPayload({
        command: "/usr/bin/my-runner",
        args: ["--run", "{contentPath}"],
        policy: { allowedCommands: ["/usr/bin/my-runner"] },
      }),
    ).toEqual({
      command: "/usr/bin/my-runner",
      args: ["--run", "{contentPath}"],
      policy: { allowedCommands: ["/usr/bin/my-runner"] },
    })
  })

  it("decodes app-level patch contributions through the inheritable whitelist", () => {
    expect(
      decodeAppPayload({
        settings: { video_driver: "glcore" },
        patches: ["/patches/app.ips"],
      }),
    ).toEqual({
      settings: { video_driver: "glcore" },
      patches: ["/patches/app.ips"],
    })
  })

  it("rejects raw settings and misplaced fields on typed RetroArch apps", () => {
    expect(() =>
      decodeAppPayload({ kind: "retroarch", settings: { video_driver: "gl" } }),
    ).toThrow(/extraSettings/)
    expect(() =>
      decodeAppPayload({ kind: "dolphin", video: { fullscreen: true } }),
    ).toThrow(/kind: retroarch/)
    expect(() => decodeAppPayload({ video: { fullscreen: true } })).toThrow(
      /kind: retroarch/,
    )
  })

  it("rejects unknown app keys", () => {
    expect(() =>
      decodeAppPayload({ settings: {}, type: "retroarch" }),
    ).toThrow()
  })
})
