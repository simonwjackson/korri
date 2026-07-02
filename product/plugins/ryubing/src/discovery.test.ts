import { describe, expect, it } from "bun:test"
import {
  KORRI_RYUBING_APP_ID,
  KORRI_RYUBING_SYSTEM_ID,
  ryubingSwitchDiscoveryProvider,
} from ".."

const baseFile = {
  storageId: "sdcard",
  rootPath: "/media/sdcard",
  absolutePath: "/media/sdcard/switch/Mario Kart 8 Deluxe.nsp",
  relativePath: "switch/Mario Kart 8 Deluxe.nsp",
  name: "Mario Kart 8 Deluxe.nsp",
  extension: ".nsp",
}

describe("ryubingSwitchDiscoveryProvider", () => {
  it.each([
    ".nsp",
    ".xci",
  ])("emits a standalone Ryubing observation for %s files", async extension => {
    const relativePath = `switch/Zelda${extension}`
    const file = {
      ...baseFile,
      absolutePath: `/media/sdcard/${relativePath}`,
      relativePath,
      name: `Zelda${extension}`,
      extension,
    }

    const observations = await Promise.resolve(
      ryubingSwitchDiscoveryProvider.discover({
        pluginId: "@korri:ryubing",
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
          id: KORRI_RYUBING_SYSTEM_ID,
          system: KORRI_RYUBING_SYSTEM_ID,
          app: KORRI_RYUBING_APP_ID,
        },
        evidence: [{ kind: "extension", value: extension }],
      },
    ])
  })

  it("does not claim unrelated files", async () => {
    const observations = await Promise.resolve(
      ryubingSwitchDiscoveryProvider.discover({
        pluginId: "@korri:ryubing",
        storageId: "sdcard",
        rootPath: "/media/sdcard",
        files: [
          {
            ...baseFile,
            relativePath: "gba/Wario.gba",
            name: "Wario.gba",
            extension: ".gba",
          },
        ],
      }),
    )

    expect(observations).toEqual([])
  })
})
