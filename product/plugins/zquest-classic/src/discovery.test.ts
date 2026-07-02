import { describe, expect, it } from "bun:test"
import {
  KORRI_ZQUEST_CLASSIC_APP_ID,
  KORRI_ZQUEST_CLASSIC_SYSTEM_ID,
  zquestClassicQuestDiscoveryProvider,
} from ".."

const baseFile = {
  storageId: "sdcard",
  rootPath: "/media/sdcard",
  absolutePath: "/media/sdcard/zelda-classic/Quest.qst",
  relativePath: "zelda-classic/Quest.qst",
  name: "Quest.qst",
  extension: ".qst",
}

describe("zquestClassicQuestDiscoveryProvider", () => {
  it("emits a standalone zplayer observation for .qst files", async () => {
    const observations = await Promise.resolve(
      zquestClassicQuestDiscoveryProvider.discover({
        pluginId: "@korri:zquest-classic",
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
          id: KORRI_ZQUEST_CLASSIC_SYSTEM_ID,
          system: KORRI_ZQUEST_CLASSIC_SYSTEM_ID,
          app: KORRI_ZQUEST_CLASSIC_APP_ID,
        },
        evidence: [{ kind: "extension", value: ".qst" }],
      },
    ])
  })

  it("does not claim non-quest files", async () => {
    const observations = await Promise.resolve(
      zquestClassicQuestDiscoveryProvider.discover({
        pluginId: "@korri:zquest-classic",
        storageId: "sdcard",
        rootPath: "/media/sdcard",
        files: [
          {
            ...baseFile,
            relativePath: "notes.txt",
            name: "notes.txt",
            extension: ".txt",
          },
        ],
      }),
    )

    expect(observations).toEqual([])
  })
})
