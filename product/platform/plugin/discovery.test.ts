import { describe, expect, it } from "bun:test"

import type { PluginId } from "."
import {
  releaseDiscoveryProvider,
  type FileDiscoveryDescriptor,
  type ReleaseDiscoveryObservation,
} from "./discovery"

describe("releaseDiscoveryProvider", () => {
  it("creates providers that classify scanner-owned file descriptors", async () => {
    const provider = releaseDiscoveryProvider({
      id: "@korri:test/gba-files",
      title: "GBA files",
      discover: ({ files }) =>
        files.map(file => ({
          kind: "file-release",
          confidence: "high",
          source: file,
          release: {
            id: "gba",
            title: "Wario Land 4",
            system: "gba",
            app: "@korri:test/app",
            runtime: "@korri:test/runtime",
          },
          evidence: [{ kind: "extension", value: ".gba" }],
        })),
    })

    const files: readonly FileDiscoveryDescriptor[] = [
      {
        storageId: "sdcard",
        rootPath: "/media/sdcard",
        absolutePath: "/media/sdcard/gba/Wario Land 4.gba",
        relativePath: "gba/Wario Land 4.gba",
        name: "Wario Land 4.gba",
        extension: ".gba",
      },
    ]

    await expect(
      Promise.resolve(
        provider.discover({
          pluginId: "@korri:test" as PluginId,
          storageId: "sdcard",
          rootPath: "/media/sdcard",
          files,
        }),
      ),
    ).resolves.toEqual([
      {
        kind: "file-release",
        confidence: "high",
        source: files[0],
        release: {
          id: "gba",
          title: "Wario Land 4",
          system: "gba",
          app: "@korri:test/app",
          runtime: "@korri:test/runtime",
        },
        evidence: [{ kind: "extension", value: ".gba" }],
      },
    ])
  })

  it("keeps provider observations free of scan timestamps", () => {
    const observation: ReleaseDiscoveryObservation = {
      kind: "file-release",
      confidence: "high",
      source: {
        storageId: "sdcard",
        rootPath: "/media/sdcard",
        absolutePath: "/media/sdcard/gba/Metroid Fusion.gba",
        relativePath: "gba/Metroid Fusion.gba",
        name: "Metroid Fusion.gba",
        extension: ".gba",
      },
      release: {
        id: "gba",
        system: "gba",
        app: "@korri:test/app",
        runtime: "@korri:test/runtime",
      },
      evidence: [{ kind: "extension", value: ".gba" }],
    }

    expect(Object.keys(observation)).not.toContain("firstSeenAt")
    expect(Object.keys(observation)).not.toContain("discoveredAt")
    expect(Object.keys(observation)).not.toContain("timestamp")
  })
})
