import { describe, expect, it } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareGmloaderLaunchEnvelope } from "./envelope"
import type { GmloaderInstalledManifest } from "./manifest"

describe("GMLoader launch envelope", () => {
  it("builds a process launch spec from an installed manifest and runtime", async () => {
    const manifest = await createManifest({ env: { SDL_AUDIODRIVER: "dummy" } })

    const envelope = await prepareGmloaderLaunchEnvelope({
      manifest,
      runtime: {
        pluginId: "@korri:gmloader",
        resourceId: "gmloader-next",
        command: "/nix/store/gmloader/bin/gmloader-next",
      },
      env: { LD_LIBRARY_PATH: "/existing" },
      sdlGameControllerConfig: "controller-map",
    })

    expect(envelope.spec).toMatchObject({
      command: "/nix/store/gmloader/bin/gmloader-next",
      args: ["-c", manifest.run.configPath],
      cwd: manifest.gameRoot,
    })
    expect(envelope.spec.env?.LD_LIBRARY_PATH).toBe(
      `${manifest.gameRoot}/lib/arm64-v8a:${manifest.gameRoot}/lib:/existing`,
    )
    expect(envelope.spec.env?.SDL_AUDIODRIVER).toBe("dummy")
    expect(envelope.spec.env?.SDL_GAMECONTROLLERCONFIG).toBe("controller-map")
  })

  it("reports missing runtime as unavailable", async () => {
    const manifest = await createManifest()

    await expect(
      prepareGmloaderLaunchEnvelope({ manifest }),
    ).rejects.toMatchObject({ reason: "unavailable" })
  })

  it("reports missing installed files as config errors", async () => {
    const manifest = await createManifest()
    const missingConfigManifest = {
      ...manifest,
      run: {
        ...manifest.run,
        configPath: join(manifest.gameRoot, "missing.json"),
      },
    }

    await expect(
      prepareGmloaderLaunchEnvelope({
        manifest: missingConfigManifest,
        command: "gmloader-next",
      }),
    ).rejects.toMatchObject({ reason: "config" })
  })
})

async function createManifest(
  input: { readonly env?: Readonly<Record<string, string>> } = {},
): Promise<GmloaderInstalledManifest> {
  const installRoot = await import("node:fs/promises").then(fs =>
    fs.mkdtemp(join(tmpdir(), "korri-gmloader-")),
  )
  const gameRoot = join(installRoot, "games", "sample")
  await mkdir(join(gameRoot, "assets"), { recursive: true })
  await mkdir(join(gameRoot, "lib", "arm64-v8a"), { recursive: true })
  await writeFile(join(gameRoot, "assets", "game.droid"), "game")
  await writeFile(join(gameRoot, "lib", "arm64-v8a", "libyoyo.so"), "runner")
  await writeFile(join(gameRoot, "gmloader.json"), "{}")
  return {
    schemaVersion: 1,
    providerId: "@korri:gmloader",
    id: "sample",
    title: "Sample",
    installedAt: "2026-06-24T00:00:00.000Z",
    installRoot,
    gameRoot,
    manifestPath: join(installRoot, "manifests", "sample.json"),
    source: {
      path: "/tmp/sample.apk",
      sizeBytes: 10,
      sha256: "abc",
      idStrategy: "content-hash",
    },
    payload: {
      _tag: "GmloaderPayloadProfile",
      sourcePath: "/tmp/sample.apk",
      kind: "archive",
      title: "Sample",
      idHint: "sample",
      gameDroid: {
        path: "assets/game.droid",
        sizeBytes: 4,
        compressionMethod: 0,
        stored: true,
      },
      libyoyo: {
        path: "lib/arm64-v8a/libyoyo.so",
        sizeBytes: 6,
        compressionMethod: 0,
        abi: "arm64-v8a",
      },
      abis: ["arm64-v8a"],
      supportLibraries: [],
      transformsRequired: ["extract-arm64-runner"],
      evidence: [],
    },
    run: {
      configPath: join(gameRoot, "gmloader.json"),
      files: [],
      libraryPaths: [join(gameRoot, "lib", "arm64-v8a"), join(gameRoot, "lib")],
    },
    compatibility: {
      transformsApplied: ["extract-arm64-runner"],
      ...(input.env ? { env: input.env } : {}),
    },
  }
}
