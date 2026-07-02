import { describe, expect, it } from "bun:test"

import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_GBA_SYSTEM_ID,
  KORRI_RETROARCH_MGBA_RUNTIME_ID,
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

describe("retroarchGbaDiscoveryProvider", () => {
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

  it("matches uppercase GBA extensions", async () => {
    const observations = await Promise.resolve(
      retroarchGbaDiscoveryProvider.discover({
        pluginId: "@korri:retroarch",
        storageId: "sdcard",
        rootPath: "/media/sdcard",
        files: [{ ...baseFile, name: "Wario.GBA", relativePath: "Wario.GBA", extension: ".GBA" }],
      }),
    )

    expect(observations).toHaveLength(1)
  })

  it("does not claim other handheld files, archives, or save files", async () => {
    const files = [
      { ...baseFile, relativePath: "gb/Tetris.gb", name: "Tetris.gb", extension: ".gb" },
      { ...baseFile, relativePath: "gbc/Zelda.gbc", name: "Zelda.gbc", extension: ".gbc" },
      { ...baseFile, relativePath: "gba/rom.zip", name: "rom.zip", extension: ".zip" },
      { ...baseFile, relativePath: "gba/save.sav", name: "save.sav", extension: ".sav" },
    ]

    const observations = await Promise.resolve(
      retroarchGbaDiscoveryProvider.discover({
        pluginId: "@korri:retroarch",
        storageId: "sdcard",
        rootPath: "/media/sdcard",
        files,
      }),
    )

    expect(observations).toEqual([])
  })
})
