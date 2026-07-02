import { describe, expect, it } from "bun:test"

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
  KORRI_RETROARCH_PPSSPP_RUNTIME_ID,
  KORRI_RETROARCH_PSP_SYSTEM_ID,
  KORRI_RETROARCH_PSX_SYSTEM_ID,
  KORRI_RETROARCH_SMS_SYSTEM_ID,
  KORRI_RETROARCH_SNES_SYSTEM_ID,
  KORRI_RETROARCH_TG16_SYSTEM_ID,
  KORRI_RETROARCH_ZXSPECTRUM_SYSTEM_ID,
  retroarchDiscoveryProviders,
  retroarchGbaDiscoveryProvider,
} from ".."

const baseFile = {
  storageId: "sdcard",
  rootPath: "/media/sdcard",
  absolutePath: "/media/sdcard/gba/Wario Land 4.gba",
  relativePath: "gba/Wario Land 4.gba",
  name: "Wario Land 4.gba",
  extension: ".gba",
}

async function discover(file: typeof baseFile, rootPath = "/media/sdcard") {
  return (
    await Promise.all(
      retroarchDiscoveryProviders.map(provider =>
        Promise.resolve(
          provider.discover({
            pluginId: "@korri:retroarch",
            storageId: "sdcard",
            rootPath,
            files: [file],
          }),
        ),
      ),
    )
  ).flat()
}

describe("retroarchDiscoveryProviders", () => {
  it("emits a high-confidence mGBA observation for GBA files", async () => {
    const observations = await Promise.resolve(
      retroarchGbaDiscoveryProvider.discover({
        pluginId: "@korri:retroarch",
        storageId: "sdcard",
        rootPath: "/media/sdcard",
        files: [baseFile],
      }),
    )

    expect(observations).toEqual([
      {
        kind: "file-release",
        confidence: "high",
        source: baseFile,
        release: {
          id: KORRI_RETROARCH_GBA_SYSTEM_ID,
          system: KORRI_RETROARCH_GBA_SYSTEM_ID,
          app: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_RETROARCH_MGBA_RUNTIME_ID,
        },
        evidence: [{ kind: "extension", value: ".gba" }],
      },
    ])
  })

  it.each([
    [
      "zxspectrum/Jet Set Willy.tzx",
      ".tzx",
      KORRI_RETROARCH_ZXSPECTRUM_SYSTEM_ID,
      KORRI_RETROARCH_FUSE_RUNTIME_ID,
    ],
    [
      "genesis/Sonic.md",
      ".md",
      KORRI_RETROARCH_GENESIS_SYSTEM_ID,
      KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
    ],
    [
      "sms/Alex Kidd.sms",
      ".sms",
      KORRI_RETROARCH_SMS_SYSTEM_ID,
      KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
    ],
    [
      "n64/Mario.z64",
      ".z64",
      KORRI_RETROARCH_N64_SYSTEM_ID,
      KORRI_RETROARCH_MUPEN64PLUS_NEXT_RUNTIME_ID,
    ],
    [
      "nes/Zelda.nes",
      ".nes",
      KORRI_RETROARCH_NES_SYSTEM_ID,
      KORRI_RETROARCH_MESEN_RUNTIME_ID,
    ],
    [
      "pc98/YU-NO.hdi",
      ".hdi",
      KORRI_RETROARCH_PC98_SYSTEM_ID,
      KORRI_RETROARCH_NP2KAI_RUNTIME_ID,
    ],
    [
      "psp/LocoRoco.iso",
      ".iso",
      KORRI_RETROARCH_PSP_SYSTEM_ID,
      KORRI_RETROARCH_PPSSPP_RUNTIME_ID,
    ],
    [
      "psx/Symphony of the Night.cue",
      ".cue",
      KORRI_RETROARCH_PSX_SYSTEM_ID,
      KORRI_RETROARCH_PCSX_REARMED_RUNTIME_ID,
    ],
    [
      "snes/Super Metroid.sfc",
      ".sfc",
      KORRI_RETROARCH_SNES_SYSTEM_ID,
      KORRI_RETROARCH_BSNES_RUNTIME_ID,
    ],
    [
      "tg16/Rondo of Blood.pce",
      ".pce",
      KORRI_RETROARCH_TG16_SYSTEM_ID,
      KORRI_RETROARCH_MEDNAFEN_PCE_FAST_RUNTIME_ID,
    ],
  ])("claims %s for the matching RetroArch runtime", async (relativePath, extension, system, runtime) => {
    const file = {
      ...baseFile,
      absolutePath: `/media/sdcard/${relativePath}`,
      relativePath,
      name: relativePath.split("/").at(-1) ?? relativePath,
      extension,
    }

    const observations = await discover(file)

    expect(observations).toHaveLength(1)
    expect(observations[0]).toMatchObject({
      kind: "file-release",
      confidence: "high",
      source: file,
      release: { id: system, system, app: KORRI_RETROARCH_APP_ID, runtime },
    })
  })

  it("uses the scanned root folder as a system hint", async () => {
    const file = {
      ...baseFile,
      absolutePath: "/media/sdcard/psp/LocoRoco.iso",
      relativePath: "LocoRoco.iso",
      name: "LocoRoco.iso",
      extension: ".iso",
    }

    const observations = await discover(file, "/media/sdcard/psp")

    expect(observations).toHaveLength(1)
    expect(observations[0]).toMatchObject({
      release: {
        id: KORRI_RETROARCH_PSP_SYSTEM_ID,
        system: KORRI_RETROARCH_PSP_SYSTEM_ID,
        runtime: KORRI_RETROARCH_PPSSPP_RUNTIME_ID,
      },
    })
  })

  it("claims non-Markdown Mega Drive files under md folders", async () => {
    const file = {
      ...baseFile,
      absolutePath: "/media/sdcard/md/Sonic.bin",
      relativePath: "md/Sonic.bin",
      name: "Sonic.bin",
      extension: ".bin",
    }

    const observations = await discover(file)

    expect(observations).toHaveLength(1)
    expect(observations[0]).toMatchObject({
      release: {
        id: KORRI_RETROARCH_GENESIS_SYSTEM_ID,
        system: KORRI_RETROARCH_GENESIS_SYSTEM_ID,
        runtime: KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
      },
    })
  })

  it("does not use parent directories as system root hints", async () => {
    const observations = await discover(
      {
        ...baseFile,
        absolutePath: "/media/md/roms/Sonic.bin",
        relativePath: "Sonic.bin",
        name: "Sonic.bin",
        extension: ".bin",
      },
      "/media/md/roms",
    )

    expect(observations).toEqual([])
  })

  it("does not treat md folders as Mega Drive hints for Markdown", async () => {
    const observations = await discover({
      ...baseFile,
      absolutePath: "/media/sdcard/md/README.md",
      relativePath: "md/README.md",
      name: "README.md",
      extension: ".md",
    })

    expect(observations).toEqual([])
  })

  it("only claims ambiguous shared disc extensions with a matching folder hint", async () => {
    const observations = await discover({
      ...baseFile,
      absolutePath: "/media/sdcard/unknown/game.cue",
      relativePath: "unknown/game.cue",
      name: "game.cue",
      extension: ".cue",
    })

    expect(observations).toEqual([])
  })

  it("does not claim other handheld files, archives, or save files", async () => {
    const files = [
      {
        ...baseFile,
        relativePath: "gb/Tetris.gb",
        name: "Tetris.gb",
        extension: ".gb",
      },
      {
        ...baseFile,
        relativePath: "gbc/Zelda.gbc",
        name: "Zelda.gbc",
        extension: ".gbc",
      },
      {
        ...baseFile,
        relativePath: "gba/save.sav",
        name: "save.sav",
        extension: ".sav",
      },
    ]

    const observations = (
      await Promise.all(files.map(file => discover(file)))
    ).flat()

    expect(observations).toEqual([])
  })
})
