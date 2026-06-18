import { describe, expect, it } from "bun:test"

import { RetroArchPolicy } from "../inheritable-fields"
import {
  type AppRecord,
  appRetroArchPolicyFromRecord,
  appSteamPolicyFromRecord,
  decodeAppPayload,
  decodeAppRecord,
  RETROARCH_APP_FIELD_KEYS,
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

  it("rejects raw settings and misplaced fields on typed RetroArch apps", () => {
    expect(() =>
      decodeAppPayload({ kind: "retroarch", settings: { video_driver: "gl" } }),
    ).toThrow(/extraSettings/)
    expect(() =>
      decodeAppPayload({ kind: "dolphin", video: { fullscreen: true } }),
    ).toThrow(/kind: retroarch/)
    expect(() =>
      decodeAppPayload({ kind: "dolphin", drivers: { menu: "ozone" } }),
    ).toThrow(/kind: retroarch/)
    expect(() => decodeAppPayload({ video: { fullscreen: true } })).toThrow(
      /kind: retroarch/,
    )
  })

  it("keeps app-flat RetroArch field extraction synchronized with the policy schema", () => {
    expect(new Set<string>(RETROARCH_APP_FIELD_KEYS)).toEqual(
      new Set(Object.keys(RetroArchPolicy.fields)),
    )

    const record: AppRecord = {
      id: "retroarch",
      kind: "retroarch",
      environment: { WAYLAND_DISPLAY: null },
      configFile: { mode: "generated", append: ["/tmp/a.cfg"] },
      core: { path: "{runtime.path}" },
      content: { path: "{content.path}" },
      logging: { verbose: true, logFile: null },
      lifecycle: { saveOnExit: false },
      drivers: { menu: "ozone" },
      paths: { systemDirectory: "/bios" },
      video: { fullscreen: true },
      audio: { enable: true },
      input: { maxUsers: 4 },
      extraSettings: { video_font_enable: false },
      extraArgs: ["--features"],
    }

    expect(appRetroArchPolicyFromRecord(record)).toEqual(
      Object.fromEntries(
        RETROARCH_APP_FIELD_KEYS.map(key => [key, record[key]]).filter(
          ([, value]) => value !== undefined,
        ),
      ),
    )
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
      decodeAppPayload({ kind: "retroarch", "launch-options": "%command%" }),
    ).toThrow(/kind: steam/)
  })



  it("rejects unknown app keys", () => {
    expect(() =>
      decodeAppPayload({ settings: {}, type: "retroarch" }),
    ).toThrow()
  })
})
