import { describe, expect, it } from "bun:test"
import { decodeAppRecord } from "@platform/library/config/records/app"
import { decodeRuntimeRecord } from "@platform/library/config/records/runtime"
import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_PLUGIN_ID,
  retroarchPlugin,
} from ".."

describe("RetroArch plugin", () => {
  it("declares RetroArch as a plugin-qualified app host", () => {
    expect(KORRI_RETROARCH_PLUGIN_ID).toBe("@korri:retroarch")
    expect(retroarchPlugin.id).toBe(KORRI_RETROARCH_PLUGIN_ID)
    expect(
      retroarchPlugin.contributes.config.providers[KORRI_RETROARCH_PLUGIN_ID],
    ).toMatchObject({ title: "RetroArch" })
    expect(retroarchPlugin.contributes.config.apps?.retroarch).toMatchObject({
      id: KORRI_RETROARCH_APP_ID,
      kind: KORRI_RETROARCH_PLUGIN_ID,
      command: "retroarch",
      plugin: { [KORRI_RETROARCH_PLUGIN_ID]: {} },
    })
  })

  it("keeps supported systems on runtimes, not the RetroArch app", () => {
    expect(() =>
      decodeAppRecord({
        id: KORRI_RETROARCH_APP_ID,
        kind: KORRI_RETROARCH_PLUGIN_ID,
        command: "retroarch",
        supports: { systems: ["pico8"] },
      }),
    ).toThrow(/supports|Unexpected key/)

    expect(
      decodeRuntimeRecord({
        id: "@korri:pico8/fake08",
        kind: "libretro-core",
        app: KORRI_RETROARCH_APP_ID,
        path: "/etc/korri/cores/fake08_libretro.so",
        supports: { systems: ["pico8"] },
      }).supports?.systems,
    ).toEqual(["pico8"])
  })
})
