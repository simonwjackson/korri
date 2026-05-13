import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { createLibraryRepository } from "@shared/library/proseql/library-repository"
import { createProseqlLibrarySource } from "@shared/library/proseql/proseql-library-source"
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
            const games = yield* Effect.promise(() => source.list())
            const newGame = games.find(game => game.metadata?.name === "New")
            return {
              summary,
              games,
              spec: newGame
                ? yield* Effect.promise(() => source.launchSpecFor(newGame.id))
                : undefined,
            }
          }),
        ),
      )

      expect(result.summary).toEqual({ imported: 2, skipped: 0, warnings: [] })
      expect(result.games.map(game => game.metadata?.name)).toEqual([
        "New",
        "Old",
      ])
      expect(result.games.map(game => game.id)).toEqual(["game-2", "game-1"])
      expect(result.spec).toEqual({
        command: lib.launchCommand,
        args: [
          join(lib.rootDir, "snes", "new.smc"),
          "-Psnes",
          "--core=snes9x",
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
              games: yield* repository.listGames(),
              specs: yield* Effect.promise(
                () => db.launchTargets.query().runPromise,
              ),
            }
          }),
        ),
      )

      expect(result.first.imported).toBe(1)
      expect(result.second._tag).toBe("Failure")
      expect(result.games.map(game => game.id)).toEqual(["game-1"])
      expect(result.specs).toHaveLength(1)
      const launchTarget = result.specs[0]
      expect(launchTarget?.id).toBe("game-1")
      expect(launchTarget && "profile" in launchTarget).toBe(true)
      if (launchTarget && "profile" in launchTarget) {
        expect(launchTarget.profile).toBe("rocknix.retroarch.snes.snes9x")
      }
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
            return { summary, games: yield* repository.listGames() }
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

  it("imports sidecar media as regular GameRecord media", async () => {
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
                  mediaRoot,
                }),
              )
              return yield* repository.listGames()
            }),
          ),
        )

        expect(games[0]?.metadata?.media).toEqual([
          {
            type: "image",
            uri: "/api/media/games/wii/mario-kart/cover-1024.jpg",
          },
        ])
      })
    } finally {
      await rm(mediaRoot, { recursive: true, force: true })
    }
  })
})
