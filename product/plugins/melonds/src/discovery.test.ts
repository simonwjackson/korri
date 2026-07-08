import { describe, expect, it } from "bun:test"
import type { ReleaseDiscoveryObservation } from "@platform/plugin/discovery"
import { melonDsNdsDiscoveryProvider } from "./discovery"
import {
  KORRI_MELONDS_APP_ID,
  KORRI_MELONDS_NDS_DISCOVERY_PROVIDER_ID,
  KORRI_MELONDS_NDS_SYSTEM_ID,
} from "./ids"

describe("melonDS NDS discovery provider", () => {
  it("claims Nintendo DS ROM files", async () => {
    const [observation] = (await melonDsNdsDiscoveryProvider.discover({
      pluginId: "@korri:melonds",
      storageId: "roms",
      rootPath: "/games",
      files: [file("Nintendo DS/Mario Kart DS.nds", ".nds")],
    })) as readonly ReleaseDiscoveryObservation[]

    expect(melonDsNdsDiscoveryProvider.id).toBe(
      KORRI_MELONDS_NDS_DISCOVERY_PROVIDER_ID,
    )
    expect(observation).toMatchObject({
      kind: "file-release",
      confidence: "high",
      release: {
        id: KORRI_MELONDS_NDS_SYSTEM_ID,
        system: KORRI_MELONDS_NDS_SYSTEM_ID,
        app: KORRI_MELONDS_APP_ID,
      },
      evidence: [{ kind: "extension", value: ".nds" }],
    })
  })

  it("matches uppercase extensions without claiming unrelated files", async () => {
    const observations = (await melonDsNdsDiscoveryProvider.discover({
      pluginId: "@korri:melonds",
      storageId: "roms",
      rootPath: "/games",
      files: [
        file("Nintendo DS/Animal Crossing.NDS", ".NDS"),
        file("Nintendo DS/archive.zip", ".zip"),
        file("gba/Metroid Fusion.gba", ".gba"),
      ],
    })) as readonly ReleaseDiscoveryObservation[]

    expect(observations).toHaveLength(1)
    expect(observations[0]?.source.relativePath).toBe(
      "Nintendo DS/Animal Crossing.NDS",
    )
  })
})

function file(relativePath: string, extension: string) {
  const name = relativePath.split("/").at(-1) ?? relativePath
  return {
    storageId: "roms",
    rootPath: "/games",
    absolutePath: `/games/${relativePath}`,
    relativePath,
    name,
    extension,
  }
}
