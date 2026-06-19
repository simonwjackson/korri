import { describe, expect, it } from "bun:test"

import { decodeAppPayload, decodeAppRecord } from "./app"

const steamProvider = "@korri:steam"

const steamPluginPolicy = {
  state: { root: "{storage:@korri:steam/steam}/Steam" },
  extra: { args: ["-silent", "-gamepadui"] },
  "launch-options": "wrapper -- %command%",
}

describe("launcher payload", () => {
  it("decodes launcher settings with common packs and typed plugin settings", () => {
    expect(
      decodeAppPayload({
        plugin: "@korri:retroarch",
        settings: {
          display: { fullscreen: true },
          audio: { latencyMs: 64 },
          plugin: {
            drivers: { video: "glcore" },
            configFile: { mode: "generated" },
          },
        },
      }),
    ).toEqual({
      plugin: "@korri:retroarch",
      settings: {
        display: { fullscreen: true },
        audio: { latencyMs: 64 },
        plugin: {
          drivers: { video: "glcore" },
          configFile: { mode: "generated" },
        },
      },
    })
  })

  it("decodes a custom process launcher with command and args", () => {
    expect(
      decodeAppPayload({
        plugin: "@korri:process",
        command: "/usr/bin/my-runner",
        args: ["--run", "{content.path}"],
        policy: { allowedCommands: ["/usr/bin/my-runner"] },
      }),
    ).toEqual({
      plugin: "@korri:process",
      command: "/usr/bin/my-runner",
      args: ["--run", "{content.path}"],
      policy: { allowedCommands: ["/usr/bin/my-runner"] },
    })
  })

  it("decodes launcher-level patch contributions through the inheritable whitelist", () => {
    expect(
      decodeAppPayload({
        plugin: "@korri:retroarch",
        settings: { plugin: { drivers: { video: "glcore" } } },
        patches: ["/patches/app.ips"],
      }),
    ).toEqual({
      plugin: "@korri:retroarch",
      settings: { plugin: { drivers: { video: "glcore" } } },
      patches: ["/patches/app.ips"],
    })
  })

  it("rejects plugin-owned settings outside settings.plugin", () => {
    expect(() =>
      decodeAppPayload({
        plugin: "@korri:retroarch",
        video: { fullscreen: true },
      }),
    ).toThrow(/Unexpected key|video/)
    expect(() =>
      decodeAppPayload({
        plugin: "@korri:retroarch",
        drivers: { menu: "ozone" },
      }),
    ).toThrow(/Unexpected key|drivers/)
  })

  it("decodes a provider-qualified Steam launcher with settings.plugin payload", () => {
    expect(
      decodeAppRecord({
        id: "@korri:steam/steam",
        plugin: steamProvider,
        command: "steam",
        runtime: "proton-arm64",
        settings: { plugin: steamPluginPolicy },
      }),
    ).toMatchObject({
      id: "@korri:steam/steam",
      plugin: steamProvider,
      command: "steam",
      runtime: "proton-arm64",
      settings: { plugin: steamPluginPolicy },
    })
  })

  it("rejects retired launcher kind and plugin policy map fields", () => {
    expect(() =>
      decodeAppPayload({
        kind: steamProvider,
        command: "steam",
      }),
    ).toThrow()
    expect(() =>
      decodeAppPayload({
        plugin: { [steamProvider]: steamPluginPolicy },
      }),
    ).toThrow()
  })

  it("rejects retired top-level Steam policy fields as unknown launcher keys", () => {
    expect(() =>
      decodeAppPayload({
        plugin: steamProvider,
        state: { root: "/steam" },
      }),
    ).toThrow(/Unexpected key|state/)
    expect(() =>
      decodeAppPayload({
        plugin: steamProvider,
        extra: { args: ["-silent"] },
      }),
    ).toThrow(/Unexpected key|extra/)
    expect(() =>
      decodeAppPayload({
        plugin: steamProvider,
        "launch-options": "%command%",
      }),
    ).toThrow(/Unexpected key|launch-options/)
  })

  it("rejects unknown launcher keys", () => {
    expect(() =>
      decodeAppPayload({ plugin: "@korri:process", type: "retroarch" }),
    ).toThrow()
  })
})
