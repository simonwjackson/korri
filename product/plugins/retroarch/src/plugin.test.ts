import { describe, expect, it } from "bun:test"
import { decodeAppRecord } from "@platform/library/config/records/app"
import { decodeRuntimeRecord } from "@platform/library/config/records/runtime"
import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_GBA_SYSTEM_ID,
  KORRI_RETROARCH_MESEN_RUNTIME_ID,
  KORRI_RETROARCH_MGBA_RUNTIME_ID,
  KORRI_RETROARCH_NES_SYSTEM_ID,
  KORRI_RETROARCH_PLUGIN_ID,
  KORRI_RETROARCH_SNES_SYSTEM_ID,
  KORRI_RETROARCH_BSNES_RUNTIME_ID,
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

  it("contributes mGBA as a RetroArch-owned GBA runtime", () => {
    expect(KORRI_RETROARCH_GBA_SYSTEM_ID).toBe("gba")
    expect(KORRI_RETROARCH_MGBA_RUNTIME_ID).toBe("@korri:retroarch/mgba")
    expect(retroarchPlugin.contributes.config.systems?.gba).toMatchObject({
      id: KORRI_RETROARCH_GBA_SYSTEM_ID,
      title: "Game Boy Advance",
      apps: [
        {
          id: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_RETROARCH_MGBA_RUNTIME_ID,
        },
      ],
    })
    expect(retroarchPlugin.contributes.config.runtimes?.mgba).toMatchObject({
      id: KORRI_RETROARCH_MGBA_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/mgba_libretro.so",
      supports: { systems: [KORRI_RETROARCH_GBA_SYSTEM_ID] },
    })
  })

  it("contributes Mesen as a RetroArch-owned NES runtime", () => {
    expect(KORRI_RETROARCH_NES_SYSTEM_ID).toBe("nes")
    expect(KORRI_RETROARCH_MESEN_RUNTIME_ID).toBe(
      "@korri:retroarch/mesen",
    )
    expect(retroarchPlugin.contributes.config.systems?.nes).toMatchObject({
      id: KORRI_RETROARCH_NES_SYSTEM_ID,
      title: "Nintendo Entertainment System",
      apps: [
        {
          id: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_RETROARCH_MESEN_RUNTIME_ID,
        },
      ],
    })
    expect(retroarchPlugin.contributes.config.runtimes?.mesen).toMatchObject({
      id: KORRI_RETROARCH_MESEN_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/mesen_libretro.so",
      supports: { systems: [KORRI_RETROARCH_NES_SYSTEM_ID] },
    })
  })

  it("contributes bsnes as a RetroArch-owned SNES runtime", () => {
    expect(KORRI_RETROARCH_SNES_SYSTEM_ID).toBe("snes")
    expect(KORRI_RETROARCH_BSNES_RUNTIME_ID).toBe(
      "@korri:retroarch/bsnes",
    )
    expect(retroarchPlugin.contributes.config.systems?.snes).toMatchObject({
      id: KORRI_RETROARCH_SNES_SYSTEM_ID,
      title: "Super Nintendo Entertainment System",
      apps: [
        {
          id: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_RETROARCH_BSNES_RUNTIME_ID,
        },
      ],
    })
    expect(retroarchPlugin.contributes.config.runtimes?.bsnes).toMatchObject({
      id: KORRI_RETROARCH_BSNES_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/bsnes_libretro.so",
      supports: { systems: [KORRI_RETROARCH_SNES_SYSTEM_ID] },
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
