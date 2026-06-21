import { describe, expect, it } from "bun:test"
import { decodeAppRecord } from "@platform/library/config/records/app"
import { decodeRuntimeRecord } from "@platform/library/config/records/runtime"
import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_BSNES_RUNTIME_ID,
  KORRI_RETROARCH_FUSE_RUNTIME_ID,
  KORRI_RETROARCH_GBA_SYSTEM_ID,
  KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
  KORRI_RETROARCH_GENESIS_SYSTEM_ID,
  KORRI_RETROARCH_MEDNAFEN_PCE_FAST_RUNTIME_ID,
  KORRI_RETROARCH_MESEN_RUNTIME_ID,
  KORRI_RETROARCH_MGBA_RUNTIME_ID,
  KORRI_RETROARCH_MUPEN64PLUS_NEXT_RUNTIME_ID,
  KORRI_RETROARCH_N64_SYSTEM_ID,
  KORRI_RETROARCH_NES_SYSTEM_ID,
  KORRI_RETROARCH_NP2KAI_RUNTIME_ID,
  KORRI_RETROARCH_PC98_SYSTEM_ID,
  KORRI_RETROARCH_PCSX_REARMED_RUNTIME_ID,
  KORRI_RETROARCH_PLUGIN_ID,
  KORRI_RETROARCH_PPSSPP_RUNTIME_ID,
  KORRI_RETROARCH_PSP_SYSTEM_ID,
  KORRI_RETROARCH_PSX_SYSTEM_ID,
  KORRI_RETROARCH_SMS_SYSTEM_ID,
  KORRI_RETROARCH_SNES_SYSTEM_ID,
  KORRI_RETROARCH_TG16_SYSTEM_ID,
  KORRI_RETROARCH_ZXSPECTRUM_SYSTEM_ID,
  retroarchPlugin,
} from ".."

describe("RetroArch plugin", () => {
  it("declares RetroArch as a plugin-qualified app host", () => {
    expect(KORRI_RETROARCH_PLUGIN_ID).toBe("@korri:retroarch")
    expect(retroarchPlugin.id).toBe(KORRI_RETROARCH_PLUGIN_ID)
    expect(
      retroarchPlugin.contributes.config.providers[KORRI_RETROARCH_PLUGIN_ID],
    ).toMatchObject({ title: "RetroArch" })
    expect(
      retroarchPlugin.contributes.config.launchers?.retroarch,
    ).toMatchObject({
      id: KORRI_RETROARCH_APP_ID,
      plugin: KORRI_RETROARCH_PLUGIN_ID,
      command: "retroarch",
      settings: { plugin: {} },
    })
  })

  it("contributes Fuse as a RetroArch-owned ZX Spectrum runtime", () => {
    expect(KORRI_RETROARCH_ZXSPECTRUM_SYSTEM_ID).toBe("zxspectrum")
    expect(KORRI_RETROARCH_FUSE_RUNTIME_ID).toBe("@korri:retroarch/fuse")
    expect(
      retroarchPlugin.contributes.config.systems?.zxspectrum,
    ).toMatchObject({
      id: KORRI_RETROARCH_ZXSPECTRUM_SYSTEM_ID,
      title: "Sinclair ZX Spectrum",
    })
    expect(retroarchPlugin.contributes.config.runtimes?.fuse).toMatchObject({
      id: KORRI_RETROARCH_FUSE_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/fuse_libretro.so",
      supports: { systems: [KORRI_RETROARCH_ZXSPECTRUM_SYSTEM_ID] },
    })
  })

  it("contributes mGBA as a RetroArch-owned GBA runtime", () => {
    expect(KORRI_RETROARCH_GBA_SYSTEM_ID).toBe("gba")
    expect(KORRI_RETROARCH_MGBA_RUNTIME_ID).toBe("@korri:retroarch/mgba")
    expect(retroarchPlugin.contributes.config.systems?.gba).toMatchObject({
      id: KORRI_RETROARCH_GBA_SYSTEM_ID,
      title: "Game Boy Advance",
    })
    expect(retroarchPlugin.contributes.config.runtimes?.mgba).toMatchObject({
      id: KORRI_RETROARCH_MGBA_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/mgba_libretro.so",
      supports: { systems: [KORRI_RETROARCH_GBA_SYSTEM_ID] },
    })
  })

  it("contributes Genesis Plus GX as a RetroArch-owned Genesis runtime", () => {
    expect(KORRI_RETROARCH_GENESIS_SYSTEM_ID).toBe("genesis")
    expect(KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID).toBe(
      "@korri:retroarch/genesis-plus-gx",
    )
    expect(retroarchPlugin.contributes.config.systems?.genesis).toMatchObject({
      id: KORRI_RETROARCH_GENESIS_SYSTEM_ID,
      title: "Sega Genesis",
    })
    expect(
      retroarchPlugin.contributes.config.runtimes?.["genesis-plus-gx"],
    ).toMatchObject({
      id: KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/genesis_plus_gx_libretro.so",
      supports: {
        systems: [
          KORRI_RETROARCH_GENESIS_SYSTEM_ID,
          KORRI_RETROARCH_SMS_SYSTEM_ID,
        ],
      },
    })
  })

  it("contributes Genesis Plus GX as a RetroArch-owned Master System runtime", () => {
    expect(KORRI_RETROARCH_SMS_SYSTEM_ID).toBe("sms")
    expect(retroarchPlugin.contributes.config.systems?.sms).toMatchObject({
      id: KORRI_RETROARCH_SMS_SYSTEM_ID,
      title: "Sega Master System",
    })
    expect(
      retroarchPlugin.contributes.config.runtimes?.["genesis-plus-gx"],
    ).toMatchObject({
      id: KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/genesis_plus_gx_libretro.so",
      supports: {
        systems: [
          KORRI_RETROARCH_GENESIS_SYSTEM_ID,
          KORRI_RETROARCH_SMS_SYSTEM_ID,
        ],
      },
    })
  })

  it("contributes Beetle PCE Fast as a RetroArch-owned TurboGrafx-16 runtime", () => {
    expect(KORRI_RETROARCH_TG16_SYSTEM_ID).toBe("tg16")
    expect(KORRI_RETROARCH_MEDNAFEN_PCE_FAST_RUNTIME_ID).toBe(
      "@korri:retroarch/mednafen-pce-fast",
    )
    expect(retroarchPlugin.contributes.config.systems?.tg16).toMatchObject({
      id: KORRI_RETROARCH_TG16_SYSTEM_ID,
      title: "NEC TurboGrafx-16",
    })
    expect(
      retroarchPlugin.contributes.config.runtimes?.["mednafen-pce-fast"],
    ).toMatchObject({
      id: KORRI_RETROARCH_MEDNAFEN_PCE_FAST_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/mednafen_pce_fast_libretro.so",
      supports: { systems: [KORRI_RETROARCH_TG16_SYSTEM_ID] },
    })
  })

  it("contributes Mupen64Plus-Next as a RetroArch-owned Nintendo 64 runtime", () => {
    expect(KORRI_RETROARCH_N64_SYSTEM_ID).toBe("n64")
    expect(KORRI_RETROARCH_MUPEN64PLUS_NEXT_RUNTIME_ID).toBe(
      "@korri:retroarch/mupen64plus-next",
    )
    expect(retroarchPlugin.contributes.config.systems?.n64).toMatchObject({
      id: KORRI_RETROARCH_N64_SYSTEM_ID,
      title: "Nintendo 64",
    })
    expect(
      retroarchPlugin.contributes.config.runtimes?.["mupen64plus-next"],
    ).toMatchObject({
      id: KORRI_RETROARCH_MUPEN64PLUS_NEXT_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/mupen64plus_next_libretro.so",
      supports: { systems: [KORRI_RETROARCH_N64_SYSTEM_ID] },
    })
  })

  it("contributes Mesen as a RetroArch-owned NES runtime", () => {
    expect(KORRI_RETROARCH_NES_SYSTEM_ID).toBe("nes")
    expect(KORRI_RETROARCH_MESEN_RUNTIME_ID).toBe("@korri:retroarch/mesen")
    expect(retroarchPlugin.contributes.config.systems?.nes).toMatchObject({
      id: KORRI_RETROARCH_NES_SYSTEM_ID,
      title: "Nintendo Entertainment System",
    })
    expect(retroarchPlugin.contributes.config.runtimes?.mesen).toMatchObject({
      id: KORRI_RETROARCH_MESEN_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/mesen_libretro.so",
      supports: { systems: [KORRI_RETROARCH_NES_SYSTEM_ID] },
    })
  })

  it("contributes NP2Kai as a RetroArch-owned PC-98 runtime", () => {
    expect(KORRI_RETROARCH_PC98_SYSTEM_ID).toBe("pc98")
    expect(KORRI_RETROARCH_NP2KAI_RUNTIME_ID).toBe("@korri:retroarch/np2kai")
    expect(retroarchPlugin.contributes.config.systems?.pc98).toMatchObject({
      id: KORRI_RETROARCH_PC98_SYSTEM_ID,
      title: "NEC PC-98",
    })
    expect(retroarchPlugin.contributes.config.runtimes?.np2kai).toMatchObject({
      id: KORRI_RETROARCH_NP2KAI_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/np2kai_libretro.so",
      supports: { systems: [KORRI_RETROARCH_PC98_SYSTEM_ID] },
    })
  })

  it("contributes PPSSPP as a RetroArch-owned PSP runtime", () => {
    expect(KORRI_RETROARCH_PSP_SYSTEM_ID).toBe("psp")
    expect(KORRI_RETROARCH_PPSSPP_RUNTIME_ID).toBe("@korri:retroarch/ppsspp")
    expect(retroarchPlugin.contributes.config.systems?.psp).toMatchObject({
      id: KORRI_RETROARCH_PSP_SYSTEM_ID,
      title: "Sony PlayStation Portable",
    })
    expect(retroarchPlugin.contributes.config.runtimes?.ppsspp).toMatchObject({
      id: KORRI_RETROARCH_PPSSPP_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/ppsspp_libretro.so",
      supports: { systems: [KORRI_RETROARCH_PSP_SYSTEM_ID] },
    })
  })

  it("contributes PCSX ReARMed as a RetroArch-owned PlayStation runtime", () => {
    expect(KORRI_RETROARCH_PSX_SYSTEM_ID).toBe("psx")
    expect(KORRI_RETROARCH_PCSX_REARMED_RUNTIME_ID).toBe(
      "@korri:retroarch/pcsx-rearmed",
    )
    expect(retroarchPlugin.contributes.config.systems?.psx).toMatchObject({
      id: KORRI_RETROARCH_PSX_SYSTEM_ID,
      title: "Sony PlayStation",
    })
    expect(
      retroarchPlugin.contributes.config.runtimes?.["pcsx-rearmed"],
    ).toMatchObject({
      id: KORRI_RETROARCH_PCSX_REARMED_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/pcsx_rearmed_libretro.so",
      supports: { systems: [KORRI_RETROARCH_PSX_SYSTEM_ID] },
    })
  })

  it("contributes bsnes as a RetroArch-owned SNES runtime", () => {
    expect(KORRI_RETROARCH_SNES_SYSTEM_ID).toBe("snes")
    expect(KORRI_RETROARCH_BSNES_RUNTIME_ID).toBe("@korri:retroarch/bsnes")
    expect(retroarchPlugin.contributes.config.systems?.snes).toMatchObject({
      id: KORRI_RETROARCH_SNES_SYSTEM_ID,
      title: "Super Nintendo Entertainment System",
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
        plugin: KORRI_RETROARCH_PLUGIN_ID,
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
