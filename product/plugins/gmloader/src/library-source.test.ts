import { describe, expect, it } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { LibrarySourceService } from "@platform/library/library-services"
import { Effect } from "effect"
import type { GmloaderInstalledManifest } from "./manifest"
import { withGmloaderInstalledLibrarySource } from "./library-source"

describe("GMLoader installed library source", () => {
  it("adds installed manifests as playable entries and launch specs", async () => {
    const installRoot = await createInstalledManifest()
    const source = withGmloaderInstalledLibrarySource(baseSource(), {
      installRoot,
      command: "/bin/gmloader-next",
    })

    const entries = await Effect.runPromise(source.listPlayableEntries?.() ?? Effect.succeed([]))
    const resolved = await Effect.runPromise(source.resolveLaunchForGame("@korri:gmloader/sample"))

    expect(entries.map(entry => entry.id)).toContain("@korri:gmloader/sample")
    expect(resolved.spec.command).toBe("/bin/gmloader-next")
    expect(resolved.spec.args).toEqual(["-c", join(installRoot, "games", "sample", "gmloader.json")])
  })

  it("marks installed entries unavailable when no runtime command is configured", async () => {
    const installRoot = await createInstalledManifest()
    const source = withGmloaderInstalledLibrarySource(baseSource(), { installRoot })

    const entries = await Effect.runPromise(source.listPlayableEntries?.() ?? Effect.succeed([]))
    const canResolve = await Effect.runPromise(
      source.canResolveLaunchForGame?.("@korri:gmloader/sample") ?? Effect.succeed(true),
    )

    expect(entries.find(entry => entry.id === "@korri:gmloader/sample")?.launchable).toBe(false)
    expect(canResolve).toBe(false)
  })

  it("delegates unknown games to the base source", async () => {
    const source = withGmloaderInstalledLibrarySource(baseSource(), {
      installRoot: await mktemp(),
      command: "/bin/gmloader-next",
    })

    const resolved = await Effect.runPromise(source.resolveLaunchForGame("base"))

    expect(resolved.spec.command).toBe("base-command")
  })
})

function baseSource(): LibrarySourceService {
  return {
    list: () => Effect.succeed([]),
    listPlayableEntries: () => Effect.succeed([]),
    launchSpecFor: id => Effect.succeed(id === "base" ? { command: "base-command", args: [] } : undefined),
    resolveLaunchForGame: id =>
      id === "base"
        ? Effect.succeed({ spec: { command: "base-command", args: [] } })
        : Effect.fail(new Error("not found") as never),
  }
}

async function createInstalledManifest(): Promise<string> {
  const installRoot = await mktemp()
  const gameRoot = join(installRoot, "games", "sample")
  await mkdir(join(installRoot, "manifests"), { recursive: true })
  await mkdir(join(gameRoot, "assets"), { recursive: true })
  await mkdir(join(gameRoot, "lib", "arm64-v8a"), { recursive: true })
  await writeFile(join(gameRoot, "assets", "game.droid"), "game")
  await writeFile(join(gameRoot, "lib", "arm64-v8a", "libyoyo.so"), "runner")
  await writeFile(join(gameRoot, "gmloader.json"), "{}")
  const manifest: GmloaderInstalledManifest = {
    schemaVersion: 1,
    providerId: "@korri:gmloader",
    id: "sample",
    title: "Sample",
    installedAt: "2026-06-24T00:00:00.000Z",
    installRoot,
    gameRoot,
    manifestPath: join(installRoot, "manifests", "sample.json"),
    source: { path: "/tmp/sample.apk", sizeBytes: 1, sha256: "abc", idStrategy: "content-hash" },
    payload: {
      _tag: "GmloaderPayloadProfile",
      sourcePath: "/tmp/sample.apk",
      kind: "archive",
      title: "Sample",
      idHint: "sample",
      gameDroid: { path: "assets/game.droid", sizeBytes: 4, stored: true },
      libyoyo: { path: "lib/arm64-v8a/libyoyo.so", sizeBytes: 6, abi: "arm64-v8a" },
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
    compatibility: { transformsApplied: ["extract-arm64-runner"] },
  }
  await writeFile(manifest.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return installRoot
}

async function mktemp(): Promise<string> {
  return import("node:fs/promises").then(fs => fs.mkdtemp(join(tmpdir(), "korri-gmloader-")))
}
