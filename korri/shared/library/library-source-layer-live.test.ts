import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Cause, Effect, Exit } from "effect"
import { withTempLibrary } from "../../../tools/testing/library/with-temp-library"
import { LibrarySource } from "./library-services"
import { LibrarySourceLayerLive } from "./library-source-layer-live"
import { openKorriLibraryDb } from "./proseql/library-db"
import { createLibraryRepository } from "./proseql/library-repository"

const originalEnv = {
  desktopProfile: process.env.KORRI_DESKTOP_PROFILE,
  librarySource: process.env.KORRI_LIBRARY_SOURCE,
  libraryRoot: process.env.KORRI_LIBRARY_ROOT,
  home: process.env.HOME,
  xdgDataHome: process.env.XDG_DATA_HOME,
  rocknixGamelistRoots: process.env.KORRI_ROCKNIX_GAMELIST_ROOTS,
  rocknixEsSystemsPath: process.env.KORRI_ROCKNIX_ES_SYSTEMS_PATH,
  rocknixMediaRoot: process.env.KORRI_ROCKNIX_MEDIA_ROOT,
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

  it("lets explicit ROCKNIX media root avoid an XDG data requirement", async () => {
    const lib = await seedRocknixGamelists()
    delete process.env.HOME
    delete process.env.XDG_DATA_HOME
    process.env.KORRI_LIBRARY_SOURCE = "rocknix"
    process.env.KORRI_ROCKNIX_GAMELIST_ROOTS = lib.rootDir
    process.env.KORRI_ROCKNIX_ES_SYSTEMS_PATH = join(
      lib.rootDir,
      "missing-es-systems.cfg",
    )
    process.env.KORRI_ROCKNIX_MEDIA_ROOT = join(lib.rootDir, "media")

    const games = await listGames()

    expect(games.map(game => game.metadata?.name)).toEqual(["Layer Echo"])
  })

  it("maps missing ROCKNIX media XDG root to a library config error", async () => {
    delete process.env.HOME
    delete process.env.XDG_DATA_HOME
    process.env.KORRI_LIBRARY_SOURCE = "rocknix"

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const source = yield* LibrarySource
        return yield* source.list()
      }).pipe(Effect.provide(LibrarySourceLayerLive)),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) throw new Error("expected failure")
    expect(Cause.squash(exit.cause)).toMatchObject({
      message: "XDG_DATA_HOME or HOME is required",
    })
  })

  it("defaults the device desktop profile to ProseQL", async () => {
    const root = await seedProseqlLibrary("Device Echo")
    const lib = await seedRocknixGamelists()
    process.env.KORRI_DESKTOP_PROFILE = "device"
    process.env.KORRI_LIBRARY_ROOT = root
    process.env.KORRI_ROCKNIX_GAMELIST_ROOTS = lib.rootDir
    process.env.KORRI_ROCKNIX_ES_SYSTEMS_PATH = join(
      lib.rootDir,
      "missing-es-systems.cfg",
    )

    const games = await listGames()

    expect(games.map(game => game.metadata?.name)).toEqual(["Device Echo"])
  })

  it("does not treat an unsupported desktop profile as a live gamelist selector", async () => {
    const root = await seedProseqlLibrary("Generic Echo")
    const lib = await seedRocknixGamelists()
    process.env.KORRI_DESKTOP_PROFILE = "legacy-device"
    process.env.KORRI_LIBRARY_ROOT = root
    process.env.KORRI_ROCKNIX_GAMELIST_ROOTS = lib.rootDir
    process.env.KORRI_ROCKNIX_ES_SYSTEMS_PATH = join(
      lib.rootDir,
      "missing-es-systems.cfg",
    )

    const games = await listGames()

    expect(games.map(game => game.metadata?.name)).toEqual(["Generic Echo"])
  })

  it("defaults ProseQL storage to the XDG data root", async () => {
    const home = await mkdtemp(join(tmpdir(), "korri-library-source-home-"))
    cleanups.push(() => rm(home, { recursive: true, force: true }))
    delete process.env.KORRI_LIBRARY_ROOT
    delete process.env.XDG_DATA_HOME
    process.env.HOME = home
    process.env.KORRI_LIBRARY_SOURCE = "proseql"

    await seedProseqlLibraryAt(
      join(home, ".local", "share", "korri", "library"),
      "XDG Echo",
    )

    const games = await listGames()

    expect(games.map(game => game.metadata?.name)).toEqual(["XDG Echo"])
  })

  it("fails clearly when proseql has no explicit or XDG-derived library root", async () => {
    delete process.env.KORRI_LIBRARY_ROOT
    delete process.env.XDG_DATA_HOME
    delete process.env.HOME
    process.env.KORRI_LIBRARY_SOURCE = "proseql"

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const source = yield* LibrarySource
        return yield* source.list()
      }).pipe(Effect.provide(LibrarySourceLayerLive)),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) throw new Error("expected failure")
    expect(Cause.squash(exit.cause)).toMatchObject({
      message:
        "KORRI_LIBRARY_ROOT, XDG_DATA_HOME, or HOME is required when KORRI_LIBRARY_SOURCE is proseql",
    })
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

async function seedProseqlLibrary(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "korri-library-source-live-"))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  await seedProseqlLibraryAt(root, name)
  return root
}

async function seedProseqlLibraryAt(root: string, name: string): Promise<void> {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
        const repository = createLibraryRepository(db)
        yield* repository.upsertGame({ id: "game-1", metadata: { name } })
        yield* Effect.promise(() => db.flush())
      }),
    ),
  )
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
  setOptionalEnv("KORRI_LIBRARY_ROOT", originalEnv.libraryRoot)
  setOptionalEnv("HOME", originalEnv.home)
  setOptionalEnv("XDG_DATA_HOME", originalEnv.xdgDataHome)
  setOptionalEnv(
    "KORRI_ROCKNIX_GAMELIST_ROOTS",
    originalEnv.rocknixGamelistRoots,
  )
  setOptionalEnv(
    "KORRI_ROCKNIX_ES_SYSTEMS_PATH",
    originalEnv.rocknixEsSystemsPath,
  )
  setOptionalEnv("KORRI_ROCKNIX_MEDIA_ROOT", originalEnv.rocknixMediaRoot)
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
