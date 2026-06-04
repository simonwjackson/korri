import { afterEach, describe, expect, it } from "bun:test"
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LibrarySourceLayerLive } from "@platform/library/library-source-layer-live"
import { Effect } from "effect"
import { decodeLaunchIntent } from "../../../../../product/services/device/game-stream-launch-intent"
import { withTempProseqlLibrary } from "../../../../../tools/testing/library/with-temp-proseql-library"
import { handleServerPrepareStream } from "./prepare.rpc-handler"

const originalEnv = {
  libraryRoot: process.env.KORRI_LIBRARY_ROOT,
  intentPath: process.env.KORRI_GAME_STREAM_INTENT_PATH,
  streamControl: process.env.KORRI_STREAM_CONTROL_ENABLED,
  runtimeDir: process.env.XDG_RUNTIME_DIR,
}
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  setOptionalEnv("KORRI_LIBRARY_ROOT", originalEnv.libraryRoot)
  setOptionalEnv("KORRI_GAME_STREAM_INTENT_PATH", originalEnv.intentPath)
  setOptionalEnv("KORRI_STREAM_CONTROL_ENABLED", originalEnv.streamControl)
  setOptionalEnv("XDG_RUNTIME_DIR", originalEnv.runtimeDir)
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe("app.server.stream.prepare handler", () => {
  it("prepares known games without exposing host intent paths", async () => {
    const { intentPath } = await setupRemoteLibrary()

    const result = await Effect.runPromise(
      handleServerPrepareStream({ id: "gba/wario-land-4" }).pipe(
        Effect.provide(LibrarySourceLayerLive),
      ),
    )

    expect(result).toMatchObject({
      status: "prepared",
      gameId: "gba/wario-land-4",
    })
    expect(result.sessionId).toBeString()
    expect("intentPath" in result).toBe(false)

    const intent = decodeLaunchIntent(
      JSON.parse(await readFile(intentPath, "utf8")),
    )
    expect(intent.id).toBe(result.sessionId)
    expect(intent.launch.args).toContain("/srv/games/wl4.gba")
    expect(intent.gamescope).toEqual({
      enabled: true,
      backend: "wayland",
      exposeWayland: true,
    })
  })

  it("carries selected preset policy into the remote runner intent", async () => {
    const { intentPath } = await setupRemoteLibrary()

    const result = await Effect.runPromise(
      handleServerPrepareStream({
        id: "gba/wario-land-4",
        presetId: "raw",
      }).pipe(Effect.provide(LibrarySourceLayerLive)),
    )

    expect(result.status).toBe("prepared")
    const intent = decodeLaunchIntent(
      JSON.parse(await readFile(intentPath, "utf8")),
    )
    expect(intent.gamescope).toEqual({
      enabled: false,
      backend: "wayland",
      exposeWayland: true,
    })
  })
})

async function setupRemoteLibrary() {
  const library = await withTempProseqlLibrary({
    systems: [{ id: "gba", launcher: "mgba" }],
    launchers: [
      {
        id: "mgba",
        command: "/bin/echo",
        args: ["{contentPath}"],
        systems: ["gba"],
      },
    ],
    games: [
      {
        id: "gba/wario-land-4",
        system: "gba",
        contentPath: "/srv/games/wl4.gba",
        metadata: { name: "Wario Land 4" },
        presets: { raw: { gamescope: { enabled: false } } },
      },
    ],
  })
  cleanups.push(library.cleanup)

  const intentDir = await mkdtemp(join(tmpdir(), "korri-server-prepare-"))
  await chmod(intentDir, 0o700)
  cleanups.push(() => rm(intentDir, { recursive: true, force: true }))

  process.env.KORRI_LIBRARY_ROOT = library.root
  process.env.KORRI_GAME_STREAM_INTENT_PATH = join(
    intentDir,
    "next-launch.json",
  )
  process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
  delete process.env.XDG_RUNTIME_DIR

  return { intentPath: process.env.KORRI_GAME_STREAM_INTENT_PATH }
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
