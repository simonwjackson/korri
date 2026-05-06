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
  id: "snes/old.smc",
  metadata: { name: "Old" },
  userData: { lastPlayed: new Date("2024-01-01T00:00:00.000Z") },
}

const newGame = {
  id: "snes/new.smc",
  metadata: { name: "New" },
  userData: { lastPlayed: new Date("2026-01-01T00:00:00.000Z") },
}

const neverPlayedGame = {
  id: "snes/never.smc",
  metadata: { name: "Never" },
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
        "snes/new.smc",
        "snes/old.smc",
        "snes/never.smc",
      ])
    })
  })

  it("resolves a stored launch spec by game id", async () => {
    await withTempRoot(async root => {
      const spec = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertGame(newGame)
            yield* repo.upsertLaunchTarget({
              id: "launch:snes/new.smc",
              gameId: newGame.id,
              spec: { command: "/bin/echo", args: ["new"] },
            })
            return yield* repo.launchSpecForGame(newGame.id)
          }),
        ),
      )

      expect(spec).toEqual({ command: "/bin/echo", args: ["new"] })
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

  it("rejects invalid launch specs at the repository boundary", async () => {
    await withTempRoot(async root => {
      const exit = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertGame(newGame)
            return yield* Effect.exit(
              repo.upsertLaunchTarget({
                id: "launch:snes/new.smc",
                gameId: newGame.id,
                spec: { command: "", args: [] },
              }),
            )
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
              launchTarget: {
                id: "launch:snes/new.smc",
                gameId: newGame.id,
                spec: { command: "/bin/echo", args: ["new"] },
              },
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
      expect(result.spec).toEqual({ command: "/bin/echo", args: ["new"] })
    })
  })

  it("does not leave an orphan game when an imported launch target is invalid", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            const exit = yield* Effect.exit(
              repo.upsertImportedGame({
                game: newGame,
                launchTarget: {
                  id: "launch:snes/new.smc",
                  gameId: newGame.id,
                  spec: { command: "", args: [] },
                },
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
