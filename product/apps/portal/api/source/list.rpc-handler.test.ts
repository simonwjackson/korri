import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LibrarySourceLayerLive } from "@platform/library/library-source-layer-live"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import { Effect } from "effect"
import { withTempProseqlLibrary } from "../../../../../tools/testing/library/with-temp-proseql-library"
import { handleListSource } from "./list.rpc-handler"

const originalEnv = {
  libraryRoot: process.env.KORRI_LIBRARY_ROOT,
  streamControl: process.env.KORRI_STREAM_CONTROL_ENABLED,
  launchArtifactsDir: process.env.KORRI_LAUNCH_ARTIFACTS_DIR,
}
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  setOptionalEnv("KORRI_LIBRARY_ROOT", originalEnv.libraryRoot)
  setOptionalEnv("KORRI_STREAM_CONTROL_ENABLED", originalEnv.streamControl)
  setOptionalEnv("KORRI_LAUNCH_ARTIFACTS_DIR", originalEnv.launchArtifactsDir)
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe("app.source.list handler", () => {
  it("returns the source catalog without requiring KORRI_STREAM_CONTROL_ENABLED (federation R14)", async () => {
    // Pre-federation behavior failed closed unless KORRI_STREAM_CONTROL_ENABLED=1.
    // Federation v1 makes the catalog always available on library-bearing
    // servers; the per-entry `streamable` flag carries stream capability.
    await setupLibrary({ enabled: false })

    const result = await Effect.runPromise(
      handleListSource({}).pipe(Effect.provide(LibrarySourceLayerLive)),
    )
    expect(result.games.length).toBeGreaterThan(0)
  })

  it("returns minimal streamable catalog games", async () => {
    await setupLibrary({ enabled: true })
    process.env.KORRI_STREAM_ADVERTISE_HOST_ID = "source-test-host"
    process.env.HOST = "127.0.0.1"
    process.env.PORT = "3001"

    const result = await Effect.runPromise(
      handleListSource({}).pipe(Effect.provide(LibrarySourceLayerLive)),
    )

    expect(result.games.map(game => game.id)).toEqual([
      "gba/wario-land-4",
      "gba/patched-missing-files",
      "gba/xdelta-patch",
    ])
    expect(result.games[0]).toMatchObject({
      id: "gba/wario-land-4",
      displayName: "Wario Land 4",
      streamable: true,
    })
    expect(result.games[0]?.source).toEqual({
      hostId: "source-test-host",
      controlUrl: "http://127.0.0.1:3001",
      isLocal: true,
    })

    delete process.env.KORRI_STREAM_ADVERTISE_HOST_ID
  })

  it("marks patched games streamable without materializing or validating patch files", async () => {
    const artifactsRoot = await mkdtemp(
      join(tmpdir(), "korri-source-list-artifacts-"),
    )
    cleanups.push(() => rm(artifactsRoot, { recursive: true, force: true }))
    process.env.KORRI_LAUNCH_ARTIFACTS_DIR = artifactsRoot
    await setupLibrary({ enabled: true })

    const result = await Effect.runPromise(
      handleListSource({}).pipe(Effect.provide(LibrarySourceLayerLive)),
    )

    expect(result.games.map(game => game.id)).toContain(
      "gba/patched-missing-files",
    )
    expect(result.games.map(game => game.id)).toContain("gba/xdelta-patch")
    expect(await readdir(artifactsRoot)).toEqual([])
  })

  it("integration: app.source.list is registered on appRpcGroup", () => {
    const tags = Array.from(appRpcGroup.requests.keys())
    expect(tags).toContain("app.source.list")
  })
})

async function setupLibrary(options: { readonly enabled: boolean }) {
  const library = await withTempProseqlLibrary({
    systems: [
      { id: "gba", launcher: "mgba" },
      { id: "snes" },
      { id: "patched-gba", launcher: "retroarch" },
    ],
    launchers: [
      {
        id: "mgba",
        command: "/bin/echo",
        args: ["{contentPath}"],
        systems: ["gba"],
      },
      {
        id: "retroarch",
        command: "/bin/echo",
        args: ["{contentPath}"],
        systems: ["patched-gba"],
      },
    ],
    games: [
      {
        id: "gba/wario-land-4",
        system: "gba",
        contentPath: "/srv/games/wl4.gba",
        metadata: { name: "Wario Land 4" },
      },
      {
        id: "snes/no-launch.sfc",
        system: "snes",
        contentPath: "/storage/roms/snes/no-launch.sfc",
        metadata: { name: "No Launch" },
      },
      {
        id: "gba/patched-missing-files",
        system: "patched-gba",
        contentPath: "/missing/roms/patched.gba",
        patches: ["/missing/patches/color.ips"],
        metadata: { name: "Patched Missing Files" },
      },
      {
        id: "gba/xdelta-patch",
        system: "patched-gba",
        contentPath: "/missing/roms/xdelta.gba",
        patches: ["/missing/patches/mod.xdelta"],
        metadata: { name: "XDelta Patch" },
      },
    ],
  })
  cleanups.push(library.cleanup)
  process.env.KORRI_LIBRARY_ROOT = library.root
  process.env.KORRI_STREAM_CONTROL_ENABLED = options.enabled ? "1" : "0"
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
