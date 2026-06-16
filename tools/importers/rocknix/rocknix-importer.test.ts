import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openKorriLibraryDb } from "@platform/library/proseql/library-db"
import { createLibraryRepository } from "@platform/library/proseql/library-repository"
import { createProseqlLibrarySource } from "@platform/library/proseql/proseql-library-source"
import { Effect } from "effect"
import { withTempLibrary } from "../../testing/library/with-temp-library"
import { importRocknixLibrary } from "./rocknix-importer"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-rocknix-import-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function sequentialGameIds(): () => string {
  let index = 0
  return () => {
    index += 1
    return `game-${index}`
  }
}

describe("importRocknixLibrary", () => {
  it("imports a ROCKNIX library into ProseQL records", async () => {
    await using lib = await withTempLibrary({
      systems: [
        {
          name: "snes",
          defaultEmulator: "retroarch",
          defaultCore: "snes9x",
          extension: [".smc"],
          games: [
            { path: "old.smc", name: "Old", lastPlayed: "20240101T000000" },
            { path: "new.smc", name: "New", lastPlayed: "20260101T000000" },
          ],
        },
      ],
    })

    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repository = createLibraryRepository(db)
            const summary = yield* Effect.promise(() =>
              importRocknixLibrary({
                repository,
                gamelistRoots: [lib.rootDir],
                esSystemsPath: lib.esSystemsPath,
                launchCommand: lib.launchCommand,
                gameIdGenerator: sequentialGameIds(),
              }),
            )
            yield* Effect.promise(() => db.flush())
            const source = createProseqlLibrarySource(repository)
            const games = yield* repository.listPlayableEntries()
            const newGame = games.find(game => game.title === "New")
            return {
              summary,
              games,
              spec: newGame
                ? yield* Effect.promise(() => source.launchSpecFor(newGame.id))
                : undefined,
              library: yield* Effect.promise(
                () => db.library.query().runPromise,
              ),
              storage: yield* Effect.promise(
                () => db.storage.query().runPromise,
              ),
              apps: yield* Effect.promise(() => db.apps.query().runPromise),
              runtimes: yield* Effect.promise(
                () => db.runtimes.query().runPromise,
              ),
            }
          }),
        ),
      )

      expect(result.summary).toEqual({ imported: 2, skipped: 0, warnings: [] })
      expect(result.games.map(game => game.title)).toEqual(["New", "Old"])
      expect(result.games.map(game => game.id)).toEqual(["game-1", "game-2"])
      expect(result.library.map(item => item.releases)).toEqual([
        [
          {
            id: "snes",
            system: "snes",
            target: {
              kind: "file",
              storage: "local-roms",
              path: "snes/new.smc",
            },
            apps: [{ id: "rocknix-retroarch", runtime: "snes9x" }],
          },
        ],
        [
          {
            id: "snes",
            system: "snes",
            target: {
              kind: "file",
              storage: "local-roms",
              path: "snes/old.smc",
            },
            apps: [{ id: "rocknix-retroarch", runtime: "snes9x" }],
          },
        ],
      ])
      expect(result.storage).toEqual([{ id: "local-roms", root: lib.rootDir }])
      expect(result.apps[0]).toMatchObject({
        id: "rocknix-retroarch",
        command: lib.launchCommand,
        args: [
          "{content.path}",
          "-P{system}",
          "--core={runtime.path}",
          "--emulator=retroarch",
        ],
      })
      expect(result.runtimes).toEqual([
        { id: "snes9x", kind: "libretro-core", path: "/legacy-cores/snes9x" },
      ])
      expect(result.spec).toEqual({
        command: lib.launchCommand,
        args: [
          join(lib.rootDir, "snes", "new.smc"),
          "-Psnes",
          "--core=/legacy-cores/snes9x",
          "--emulator=retroarch",
        ],
      })
    })
  })

  it("rejects importing into a non-empty Korri library", async () => {
    await using lib = await withTempLibrary({
      systems: [
        {
          name: "snes",
          defaultEmulator: "retroarch",
          defaultCore: "snes9x",
          games: [{ path: "echo.smc", name: "Echo" }],
        },
      ],
    })

    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repository = createLibraryRepository(db)
            const config = {
              repository,
              gamelistRoots: [lib.rootDir],
              esSystemsPath: lib.esSystemsPath,
              launchCommand: lib.launchCommand,
              gameIdGenerator: sequentialGameIds(),
            }
            const first = yield* Effect.promise(() =>
              importRocknixLibrary(config),
            )
            const second = yield* Effect.exit(
              Effect.promise(() => importRocknixLibrary(config)),
            )
            yield* Effect.promise(() => db.flush())
            return {
              first,
              second,
              games: yield* repository.listPlayableEntries(),
              apps: yield* Effect.promise(() => db.apps.query().runPromise),
              systems: yield* Effect.promise(
                () => db.systems.query().runPromise,
              ),
            }
          }),
        ),
      )

      expect(result.first.imported).toBe(1)
      expect(result.second._tag).toBe("Failure")
      expect(result.games.map(game => game.id)).toEqual(["game-1"])
      expect(result.games[0]?.system).toBe("snes")
      expect(result.games[0]?.releases[0]?.target).toEqual({
        kind: "file",
        storage: "local-roms",
        path: "snes/echo.smc",
      })
      expect(result.apps).toHaveLength(1)
      expect(result.apps[0]?.id).toBe("rocknix-retroarch")
      expect(
        result.systems.find(s => s.id === "snes")?.cores?.["rocknix-retroarch"],
      ).toBe("snes9x")
    })
  })

  it("skips systems absent from es_systems.cfg with a warning", async () => {
    await using lib = await withTempLibrary({
      systems: [
        {
          name: "snes",
          defaultEmulator: "retroarch",
          defaultCore: "snes9x",
          games: [{ path: "echo.smc", name: "Echo" }],
        },
      ],
    })
    await Bun.write(lib.esSystemsPath, `<?xml version="1.0"?><systemList />`)

    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repository = createLibraryRepository(db)
            const summary = yield* Effect.promise(() =>
              importRocknixLibrary({
                repository,
                gamelistRoots: [lib.rootDir],
                esSystemsPath: lib.esSystemsPath,
                launchCommand: lib.launchCommand,
              }),
            )
            return { summary, games: yield* repository.listPlayableEntries() }
          }),
        ),
      )

      expect(result.summary.imported).toBe(0)
      expect(result.summary.skipped).toBe(1)
      expect(result.summary.warnings.map(warning => warning.reason)).toEqual([
        "missing-system",
      ])
      expect(result.games).toEqual([])
    })
  })

  it("does not import sidecar media into playable metadata", async () => {
    await using lib = await withTempLibrary({
      systems: [
        {
          name: "wii",
          defaultEmulator: "dolphin-sa",
          defaultCore: "dolphin-sa",
          extension: [".rvz"],
          games: [{ path: "mario-kart.rvz", name: "Mario Kart" }],
        },
      ],
    })
    const mediaRoot = await mkdtemp(join(tmpdir(), "korri-rocknix-media-"))
    try {
      await mkdir(join(mediaRoot, "wii", "mario-kart"), { recursive: true })
      await Bun.write(
        join(mediaRoot, "wii", "mario-kart", "cover-1024.jpg"),
        "cover",
      )

      await withTempRoot(async root => {
        const games = await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
              const repository = createLibraryRepository(db)
              yield* Effect.promise(() =>
                importRocknixLibrary({
                  repository,
                  gamelistRoots: [lib.rootDir],
                  esSystemsPath: lib.esSystemsPath,
                  launchCommand: lib.launchCommand,
                }),
              )
              return yield* repository.listPlayableEntries()
            }),
          ),
        )

        expect(games[0]?.media).toBeUndefined()
      })
    } finally {
      await rm(mediaRoot, { recursive: true, force: true })
    }
  })
})
