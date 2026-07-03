import { describe, expect, it } from "bun:test"
import { normalizePluginHandlerResult } from "@platform/plugin"
import { Effect } from "effect"

import {
  KORRI_RPCS3_APP_ID,
  KORRI_RPCS3_PLUGIN_ID,
  KORRI_RPCS3_PS3_DISC_DISCOVERY_PROVIDER_ID,
  KORRI_RPCS3_PS3_SYSTEM_ID,
  KORRI_RPCS3_RUNTIME_ID,
  rpcs3Ps3DiscFolderDiscoveryProvider,
} from ".."

/**
 * Resolve a discovery provider's `PluginResult` (sync array, promise, or
 * Effect) the same way production does, yielding the concrete observation
 * array for assertions.
 */
const runDiscover = (
  result: ReturnType<typeof rpcs3Ps3DiscFolderDiscoveryProvider.discover>,
) => Effect.runPromise(normalizePluginHandlerResult(result))

const baseFile = {
  storageId: "ps3-games",
  rootPath: "/srv/lakes/towada/gaming/games/sony-playstation-3",
  absolutePath:
    "/srv/lakes/towada/gaming/games/sony-playstation-3/Skate 3 [BLUS30464]/PS3_DISC.SFB",
  relativePath: "Skate 3 [BLUS30464]/PS3_DISC.SFB",
  name: "PS3_DISC.SFB",
  extension: ".SFB",
}

describe("rpcs3Ps3DiscFolderDiscoveryProvider", () => {
  it("declares a stable provider id", () => {
    expect(rpcs3Ps3DiscFolderDiscoveryProvider.id).toBe(
      KORRI_RPCS3_PS3_DISC_DISCOVERY_PROVIDER_ID,
    )
  })

  it("emits a high-confidence PS3 observation for direct child disc folders", async () => {
    const observations = await runDiscover(
      rpcs3Ps3DiscFolderDiscoveryProvider.discover({
        pluginId: KORRI_RPCS3_PLUGIN_ID,
        storageId: "ps3-games",
        rootPath: baseFile.rootPath,
        files: [baseFile],
        readText: async () => undefined,
      }),
    )

    expect(observations).toEqual([
      {
        kind: "file-release",
        confidence: "high",
        source: baseFile,
        release: {
          id: "skate-3-blus30464",
          title: "Skate 3 [BLUS30464]",
          system: KORRI_RPCS3_PS3_SYSTEM_ID,
          app: KORRI_RPCS3_APP_ID,
          runtime: KORRI_RPCS3_RUNTIME_ID,
        },
        evidence: [{ kind: "marker", value: "PS3_DISC.SFB" }],
      },
    ])
  })

  it("discovers multiple sibling game folders independently", async () => {
    const observations = await runDiscover(
      rpcs3Ps3DiscFolderDiscoveryProvider.discover({
        pluginId: KORRI_RPCS3_PLUGIN_ID,
        storageId: "ps3-games",
        rootPath: baseFile.rootPath,
        files: [
          baseFile,
          {
            ...baseFile,
            absolutePath: `${baseFile.rootPath}/Another Game [TEST12345]/PS3_DISC.SFB`,
            relativePath: "Another Game [TEST12345]/PS3_DISC.SFB",
          },
        ],
        readText: async () => undefined,
      }),
    )

    expect(observations.map(observation => observation.release.id)).toEqual([
      "skate-3-blus30464",
      "another-game-test12345",
    ])
    expect(observations.map(observation => observation.release.title)).toEqual([
      "Skate 3 [BLUS30464]",
      "Another Game [TEST12345]",
    ])
  })

  it("does not claim virtual HDD state, nested markers, or PS3_GAME files", async () => {
    const files = [
      {
        ...baseFile,
        absolutePath: `${baseFile.rootPath}/_dev_hdd0/BLUS30464/PARAM.SFO`,
        relativePath: "_dev_hdd0/BLUS30464/PARAM.SFO",
        name: "PARAM.SFO",
        extension: ".SFO",
      },
      {
        ...baseFile,
        absolutePath: `${baseFile.rootPath}/_dev_hdd0/PS3_DISC.SFB`,
        relativePath: "_dev_hdd0/PS3_DISC.SFB",
      },
      {
        ...baseFile,
        absolutePath: `${baseFile.rootPath}/Skate 3 [BLUS30464]/PS3_GAME/PARAM.SFO`,
        relativePath: "Skate 3 [BLUS30464]/PS3_GAME/PARAM.SFO",
        name: "PARAM.SFO",
        extension: ".SFO",
      },
      {
        ...baseFile,
        absolutePath: `${baseFile.rootPath}/nested/Skate 3 [BLUS30464]/PS3_DISC.SFB`,
        relativePath: "nested/Skate 3 [BLUS30464]/PS3_DISC.SFB",
      },
      {
        ...baseFile,
        absolutePath: `${baseFile.rootPath}/Disc Games Can Be Put Here For Automatic Detection.txt`,
        relativePath: "Disc Games Can Be Put Here For Automatic Detection.txt",
        name: "Disc Games Can Be Put Here For Automatic Detection.txt",
        extension: ".txt",
      },
    ]

    const observations = await runDiscover(
      rpcs3Ps3DiscFolderDiscoveryProvider.discover({
        pluginId: KORRI_RPCS3_PLUGIN_ID,
        storageId: "ps3-games",
        rootPath: baseFile.rootPath,
        files,
        readText: async () => undefined,
      }),
    )

    expect(observations).toEqual([])
  })
})
