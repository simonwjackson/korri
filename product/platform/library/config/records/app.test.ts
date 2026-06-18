import { describe, expect, it } from "bun:test"

import {
  type AppRecord,
  appSteamPolicyFromRecord,
  decodeAppPayload,
  decodeAppRecord,
} from "./app"

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
      decodeAppPayload({ kind: "@korri:retroarch", video: { fullscreen: true } }),
    ).toThrow(/Unexpected key|video/)
    expect(() =>
      decodeAppPayload({ kind: "@korri:retroarch", drivers: { menu: "ozone" } }),
    ).toThrow(/Unexpected key|drivers/)
  })

  it("decodes a first-class Steam app and extracts policy", () => {
    const record: AppRecord = {
      id: "steam",
      kind: "steam",
      command: "steam",
      runtime: "proton-arm64",
      state: { root: "{storage:steam}/Steam" },
      extra: { args: ["-silent", "-gamepadui"] },
      "launch-options": "wrapper -- %command%",
    }

    expect(decodeAppRecord(record)).toMatchObject({
      kind: "steam",
      state: { root: "{storage:steam}/Steam" },
      extra: { args: ["-silent", "-gamepadui"] },
      "launch-options": "wrapper -- %command%",
    })
    expect(appSteamPolicyFromRecord(record)).toEqual({
      state: { root: "{storage:steam}/Steam" },
      extra: { args: ["-silent", "-gamepadui"] },
      "launch-options": "wrapper -- %command%",
    })
  })

  it("rejects Steam-only fields outside Steam apps", () => {
    expect(() => decodeAppPayload({ kind: "steam", command: "steam" })).toThrow(
      /state.root/,
    )
    expect(() =>
      decodeAppPayload({
        kind: "steam",
        state: { root: "/steam" },
        extra: { config: {} },
      }),
    ).toThrow(/config/)
    expect(() =>
      decodeAppPayload({ kind: "@korri:retroarch", "launch-options": "%command%" }),
    ).toThrow(/kind: steam/)
  })



  it("rejects unknown app keys", () => {
    expect(() =>
      decodeAppPayload({ settings: {}, type: "retroarch" }),
    ).toThrow()
  })
})
