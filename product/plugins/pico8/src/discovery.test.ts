import { describe, expect, it } from "bun:test"
import { KORRI_RETROARCH_APP_ID } from "../../retroarch"
import {
  KORRI_PICO8_FAKE08_RUNTIME_ID,
  KORRI_PICO8_SYSTEM_ID,
  pico8CartDiscoveryProvider,
} from ".."

const baseFile = {
  storageId: "sdcard",
  rootPath: "/media/sdcard",
  absolutePath: "/media/sdcard/pico8/Celeste.p8.png",
  relativePath: "pico8/Celeste.p8.png",
  name: "Celeste.p8.png",
  extension: ".png",
}

describe("pico8CartDiscoveryProvider", () => {
  it.each([
    ["pico8/Celeste.p8.png", ".png", ".p8.png"],
    ["pico8/Prototype.p8", ".p8", ".p8"],
  ])("emits a fake08 observation for %s", async (relativePath, extension, evidence) => {
    const file = {
      ...baseFile,
      absolutePath: `/media/sdcard/${relativePath}`,
      relativePath,
      name: relativePath.split("/").at(-1) ?? relativePath,
      extension,
    }

    const observations = await Promise.resolve(
      pico8CartDiscoveryProvider.discover({
        pluginId: "@korri:pico8",
        storageId: "sdcard",
        rootPath: "/media/sdcard",
        files: [file],
      }),
    )

    expect(observations).toEqual([
      {
        kind: "file-release",
        confidence: "high",
        source: file,
        release: {
          id: KORRI_PICO8_SYSTEM_ID,
          system: KORRI_PICO8_SYSTEM_ID,
          app: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_PICO8_FAKE08_RUNTIME_ID,
        },
        evidence: [{ kind: "extension", value: evidence }],
      },
    ])
  })

  it("does not claim unrelated PNG art", async () => {
    const observations = await Promise.resolve(
      pico8CartDiscoveryProvider.discover({
        pluginId: "@korri:pico8",
        storageId: "sdcard",
        rootPath: "/media/sdcard",
        files: [
          { ...baseFile, relativePath: "art/cover.png", name: "cover.png" },
        ],
      }),
    )

    expect(observations).toEqual([])
  })
})
