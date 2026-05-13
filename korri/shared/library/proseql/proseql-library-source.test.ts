import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"

import { openKorriLibraryDb } from "./library-db"
import { createLibraryRepository } from "./library-repository"
import { createProseqlLibrarySource } from "./proseql-library-source"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-source-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("createProseqlLibrarySource", () => {
  it("reads games and launch specs through the existing LibrarySource contract", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertImportedGame({
              game: {
                id: "snes/f-zero.smc",
                metadata: { name: "F-Zero" },
                userData: {
                  lastPlayed: new Date("2026-01-01T00:00:00.000Z"),
                },
              },
              launcherProfile: {
                id: "echo.snes",
                command: "/bin/echo",
                args: ["{contentPath}"],
              },
              launchTarget: {
                id: "snes/f-zero.smc",
                profile: "echo.snes",
                contentPath: "f-zero",
              },
            })
            yield* Effect.promise(() => db.flush())

            const source = createProseqlLibrarySource(repo)
            return {
              games: yield* Effect.promise(() => source.list()),
              spec: yield* Effect.promise(() =>
                source.launchSpecFor("snes/f-zero.smc"),
              ),
            }
          }),
        ),
      )

      expect(result.games.map(game => game.metadata?.name)).toEqual(["F-Zero"])
      expect(result.spec).toEqual({ command: "/bin/echo", args: ["f-zero"] })
    })
  })

  it("returns undefined for an unknown launch spec", async () => {
    await withTempRoot(async root => {
      const spec = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const source = createProseqlLibrarySource(
              createLibraryRepository(db),
            )
            return yield* Effect.promise(() => source.launchSpecFor("missing"))
          }),
        ),
      )

      expect(spec).toBeUndefined()
    })
  })
})
