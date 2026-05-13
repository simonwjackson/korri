import { afterEach, describe, expect, it } from "bun:test"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import { Effect } from "effect"
import { withTempLibrary } from "../../../tools/testing/library/with-temp-library"
import { LibrarySource } from "./library-services"
import { LibrarySourceLayerLive } from "./library-source-layer-live"

const originalEnv = {
  desktopProfile: process.env.KORRI_DESKTOP_PROFILE,
  librarySource: process.env.KORRI_LIBRARY_SOURCE,
  rocknixGamelistRoots: process.env.KORRI_ROCKNIX_GAMELIST_ROOTS,
  rocknixEsSystemsPath: process.env.KORRI_ROCKNIX_ES_SYSTEMS_PATH,
}
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  restoreEnv()
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe("LibrarySourceLayerLive", () => {
  it("uses ROCKNIX gamelists when explicitly selected", async () => {
    const lib = await seedRocknixGamelists()
    process.env.KORRI_LIBRARY_SOURCE = "rocknix"
    process.env.KORRI_ROCKNIX_GAMELIST_ROOTS = lib.rootDir
    process.env.KORRI_ROCKNIX_ES_SYSTEMS_PATH = join(
      lib.rootDir,
      "missing-es-systems.cfg",
    )

    const games = await listGames()

    expect(games.map(game => game.metadata?.name)).toEqual(["Layer Echo"])
  })

  it("defaults the Odin desktop profile to ROCKNIX gamelists", async () => {
    const lib = await seedRocknixGamelists()
    process.env.KORRI_DESKTOP_PROFILE = "odin"
    process.env.KORRI_ROCKNIX_GAMELIST_ROOTS = lib.rootDir
    process.env.KORRI_ROCKNIX_ES_SYSTEMS_PATH = join(
      lib.rootDir,
      "missing-es-systems.cfg",
    )

    const games = await listGames()

    expect(games.map(game => game.metadata?.name)).toEqual(["Layer Echo"])
  })
})

async function seedRocknixGamelists() {
  const lib = await withTempLibrary({
    systems: [
      {
        name: "snes",
        defaultEmulator: "retroarch",
        defaultCore: "snes9x",
        extension: [".smc"],
        games: [{ path: "echo.smc", name: "Layer Echo" }],
      },
    ],
  })
  cleanups.push(lib.cleanup)
  await rm(lib.esSystemsPath, { force: true })
  return lib
}

async function listGames() {
  return Effect.runPromise(
    Effect.gen(function* () {
      const source = yield* LibrarySource
      return yield* source.list()
    }).pipe(Effect.provide(LibrarySourceLayerLive)),
  )
}

function restoreEnv(): void {
  setOptionalEnv("KORRI_DESKTOP_PROFILE", originalEnv.desktopProfile)
  setOptionalEnv("KORRI_LIBRARY_SOURCE", originalEnv.librarySource)
  setOptionalEnv(
    "KORRI_ROCKNIX_GAMELIST_ROOTS",
    originalEnv.rocknixGamelistRoots,
  )
  setOptionalEnv(
    "KORRI_ROCKNIX_ES_SYSTEMS_PATH",
    originalEnv.rocknixEsSystemsPath,
  )
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
