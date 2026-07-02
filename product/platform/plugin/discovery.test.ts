import { describe, expect, it } from "bun:test"

import type { PluginId } from "."
import {
  type FileDiscoveryDescriptor,
  type ReleaseDiscoveryObservation,
  releaseDiscoveryProvider,
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

  it("creates providers that emit provider-ref observations from readable evidence", async () => {
    const provider = releaseDiscoveryProvider({
      id: "@korri:test/installed-apps",
      title: "Installed apps",
      discover: async ({ files, readText }) => {
        const manifest = files.find(
          file => file.name === "appmanifest_1029210.acf",
        )
        const content = manifest
          ? await readText?.(manifest.absolutePath)
          : undefined
        if (manifest === undefined || content === undefined) return []
        return [
          {
            kind: "provider-ref-release",
            confidence: "high",
            source: manifest,
            target: { provider: "@korri:test", ref: "1029210" },
            release: {
              id: "steam",
              title: "30XX",
              system: "steam",
            },
            launch: { use: "@korri:test/app" },
            evidence: [{ kind: "manifest", value: manifest.relativePath }],
          },
        ]
      },
    })

    const files: readonly FileDiscoveryDescriptor[] = [
      {
        storageId: "steam",
        rootPath: "/var/lib/korri/steam",
        absolutePath: "/var/lib/korri/steam/steamapps/appmanifest_1029210.acf",
        relativePath: "steamapps/appmanifest_1029210.acf",
        name: "appmanifest_1029210.acf",
        extension: ".acf",
      },
    ]

    await expect(
      Promise.resolve(
        provider.discover({
          pluginId: "@korri:test" as PluginId,
          storageId: "steam",
          rootPath: "/var/lib/korri/steam",
          files,
          readText: async path =>
            path.endsWith("1029210.acf") ? "acf" : undefined,
        }),
      ),
    ).resolves.toEqual([
      {
        kind: "provider-ref-release",
        confidence: "high",
        source: files[0],
        target: { provider: "@korri:test", ref: "1029210" },
        release: {
          id: "steam",
          title: "30XX",
          system: "steam",
        },
        launch: { use: "@korri:test/app" },
        evidence: [
          { kind: "manifest", value: "steamapps/appmanifest_1029210.acf" },
        ],
      },
    ])
  })

  it("keeps provider observations free of scan timestamps", () => {
    const observations: readonly ReleaseDiscoveryObservation[] = [
      {
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
      },
      {
        kind: "provider-ref-release",
        confidence: "high",
        source: {
          storageId: "steam",
          rootPath: "/var/lib/korri/steam",
          absolutePath:
            "/var/lib/korri/steam/steamapps/appmanifest_1029210.acf",
          relativePath: "steamapps/appmanifest_1029210.acf",
          name: "appmanifest_1029210.acf",
          extension: ".acf",
        },
        target: { provider: "@korri:test", ref: "1029210" },
        release: { id: "steam", system: "steam" },
        launch: { use: "@korri:test/app" },
        evidence: [
          { kind: "manifest", value: "steamapps/appmanifest_1029210.acf" },
        ],
      },
    ]

    for (const observation of observations) {
      expect(Object.keys(observation)).not.toContain("firstSeenAt")
      expect(Object.keys(observation)).not.toContain("discoveredAt")
      expect(Object.keys(observation)).not.toContain("timestamp")
    }
  })
})
