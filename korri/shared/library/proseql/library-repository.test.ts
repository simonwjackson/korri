import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"

import { openKorriLibraryDb } from "./library-db"
import { createLibraryRepository } from "./library-repository"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-repository-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const oldGame = {
  id: "game-old",
  metadata: { name: "Old" },
  userData: { lastPlayed: new Date("2024-01-01T00:00:00.000Z") },
}

const newGame = {
  id: "game-new",
  metadata: { name: "New" },
  userData: { lastPlayed: new Date("2026-01-01T00:00:00.000Z") },
}

const neverPlayedGame = {
  id: "game-never",
  metadata: { name: "Never" },
}

const launcherProfile = {
  id: "rocknix.retroarch.snes",
  command: "/bin/echo",
  args: ["{contentPath}", "-P{system}", "--core={core}"],
  defaults: { system: "snes", core: "snes9x" },
}

const launchTarget = {
  id: newGame.id,
  profile: launcherProfile.id,
  contentPath: "/storage/roms/snes/New Game.smc",
}

describe("createLibraryRepository", () => {
  it("lists games newest first with never-played games last", async () => {
    await withTempRoot(async root => {
      const listed = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertGame(oldGame)
            yield* repo.upsertGame(neverPlayedGame)
            yield* repo.upsertGame(newGame)
            return yield* repo.listGames()
          }),
        ),
      )

      expect(listed.map(game => game.id)).toEqual([
        "game-new",
        "game-old",
        "game-never",
      ])
    })
  })

  it("resolves a profile-backed launch spec by game id", async () => {
    await withTempRoot(async root => {
      const spec = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertGame(newGame)
            yield* repo.upsertLauncherProfile(launcherProfile)
            yield* repo.upsertLaunchTarget(launchTarget)
            return yield* repo.launchSpecForGame(newGame.id)
          }),
        ),
      )

      expect(spec).toEqual({
        command: "/bin/echo",
        args: ["/storage/roms/snes/New Game.smc", "-Psnes", "--core=snes9x"],
      })
    })
  })

  it("returns undefined when a game has no launch target", async () => {
    await withTempRoot(async root => {
      const spec = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertGame(neverPlayedGame)
            return yield* repo.launchSpecForGame(neverPlayedGame.id)
          }),
        ),
      )

      expect(spec).toBeUndefined()
    })
  })

  it("does not let legacy resolved-spec targets prevent listing games", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertGame(newGame)
            yield* repo.upsertLaunchTarget({
              id: `launch:${newGame.id}`,
              gameId: newGame.id,
              spec: { command: "/bin/echo", args: ["legacy"] },
            })
            const exit = yield* Effect.exit(repo.launchSpecForGame(newGame.id))
            return { games: yield* repo.listGames(), exit }
          }),
        ),
      )

      expect(result.games.map(game => game.id)).toEqual([newGame.id])
      expect(result.exit._tag).toBe("Failure")
    })
  })

  it("fails resolution when the referenced profile is missing", async () => {
    await withTempRoot(async root => {
      const exit = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertGame(newGame)
            yield* repo.upsertLaunchTarget(launchTarget)
            return yield* Effect.exit(repo.launchSpecForGame(newGame.id))
          }),
        ),
      )

      expect(exit._tag).toBe("Failure")
    })
  })

  it("fails resolution when a profile is missing a required placeholder value", async () => {
    await withTempRoot(async root => {
      const exit = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertGame(newGame)
            yield* repo.upsertLauncherProfile({
              ...launcherProfile,
              defaults: { system: "snes" },
            })
            yield* repo.upsertLaunchTarget(launchTarget)
            return yield* Effect.exit(repo.launchSpecForGame(newGame.id))
          }),
        ),
      )

      expect(exit._tag).toBe("Failure")
    })
  })

  it("writes imported game records atomically", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertImportedGame({
              game: newGame,
              launcherProfile,
              launchTarget,
            })
            yield* Effect.promise(() => db.flush())
            return {
              games: yield* repo.listGames(),
              spec: yield* repo.launchSpecForGame(newGame.id),
            }
          }),
        ),
      )

      expect(result.games.map(game => game.id)).toEqual([newGame.id])
      expect(result.spec).toEqual({
        command: "/bin/echo",
        args: ["/storage/roms/snes/New Game.smc", "-Psnes", "--core=snes9x"],
      })
    })
  })

  it("does not leave an orphan game when an imported profile is invalid", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            const exit = yield* Effect.exit(
              repo.upsertImportedGame({
                game: newGame,
                launcherProfile: { ...launcherProfile, command: "" },
                launchTarget,
              }),
            )
            return { exit, games: yield* repo.listGames() }
          }),
        ),
      )

      expect(result.exit._tag).toBe("Failure")
      expect(result.games).toEqual([])
    })
  })
})
