import { describe, expect, it } from "bun:test"

import { decodeAppPayload, decodeAppRecord } from "./app"

const steamProvider = "@korri:steam"

const steamPluginPolicy = {
  state: { root: "{storage:@korri:steam/steam}/Steam" },
  extra: { args: ["-silent", "-gamepadui"] },
  "launch-options": "wrapper -- %command%",
}

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

  it("rejects RetroArch-owned fields on app records", () => {
    expect(() =>
      decodeAppPayload({
        kind: "@korri:retroarch",
        video: { fullscreen: true },
      }),
    ).toThrow(/Unexpected key|video/)
    expect(() =>
      decodeAppPayload({
        kind: "@korri:retroarch",
        drivers: { menu: "ozone" },
      }),
    ).toThrow(/Unexpected key|drivers/)
  })

  it("decodes a provider-qualified Steam app with plugin policy payload", () => {
    expect(
      decodeAppRecord({
        id: "@korri:steam/steam",
        kind: steamProvider,
        command: "steam",
        runtime: "proton-arm64",
        plugin: { [steamProvider]: steamPluginPolicy },
      }),
    ).toMatchObject({
      id: "@korri:steam/steam",
      kind: steamProvider,
      command: "steam",
      runtime: "proton-arm64",
      plugin: { [steamProvider]: steamPluginPolicy },
    })
  })

  it("rejects retired kind: steam", () => {
    expect(() =>
      decodeAppPayload({
        kind: "steam",
        command: "steam",
      }),
    ).toThrow(/kind: steam was retired/)
  })

  it("rejects retired top-level Steam policy fields as unknown app keys", () => {
    expect(() =>
      decodeAppPayload({
        kind: steamProvider,
        state: { root: "/steam" },
      }),
    ).toThrow(/Unexpected key|state/)
    expect(() =>
      decodeAppPayload({
        kind: steamProvider,
        extra: { args: ["-silent"] },
      }),
    ).toThrow(/Unexpected key|extra/)
    expect(() =>
      decodeAppPayload({
        kind: steamProvider,
        "launch-options": "%command%",
      }),
    ).toThrow(/Unexpected key|launch-options/)
  })

  it("rejects unknown app keys", () => {
    expect(() =>
      decodeAppPayload({ settings: {}, type: "retroarch" }),
    ).toThrow()
  })
})
