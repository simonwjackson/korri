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
  it("reads games and resolves launch specs through the cascade", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertImportedGame({
              game: {
                id: "snes/f-zero.smc",
                system: "snes",
                contentPath: "/storage/roms/snes/f-zero.smc",
                metadata: { name: "F-Zero" },
                userData: {
                  lastPlayed: new Date("2026-01-01T00:00:00.000Z"),
                },
              },
              launcher: {
                id: "echo",
                command: "/bin/echo",
                args: ["{contentPath}"],
                systems: ["snes"],
              },
              systemDelta: { id: "snes" },
            })
            yield* Effect.promise(() => db.flush())

            const source = createProseqlLibrarySource(repo)
            return {
              games: yield* Effect.promise(() => source.list()),
              spec: yield* Effect.promise(() =>
                source.launchSpecFor("snes/f-zero.smc"),
              ),
              resolved: yield* Effect.promise(() =>
                source.resolveLaunchForGame("snes/f-zero.smc"),
              ),
            }
          }),
        ),
      )

      expect(result.games.map(g => g.metadata?.name)).toEqual(["F-Zero"])
      expect(result.spec).toEqual({
        command: "/bin/echo",
        args: ["/storage/roms/snes/f-zero.smc"],
      })
      expect(result.resolved.spec).toEqual({
        command: "/bin/echo",
        args: ["/storage/roms/snes/f-zero.smc"],
      })
    })
  })

  it("launchSpecFor returns undefined for an unknown game (back-compat shim)", async () => {
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

  it("resolveLaunchForGame rejects on an unknown game (typed-error path)", async () => {
    await withTempRoot(async root => {
      let threw = false
      try {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
              const source = createProseqlLibrarySource(
                createLibraryRepository(db),
              )
              return yield* Effect.promise(() =>
                source.resolveLaunchForGame("missing"),
              )
            }),
          ),
        )
      } catch {
        threw = true
      }
      expect(threw).toBe(true)
    })
  })
})
