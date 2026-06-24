import { describe, expect, it } from "bun:test"
import { games } from "@platform/fixtures/games/games"
import { Effect } from "effect"
import { openInMemoryKorriLibraryDb } from "./library-db"
import { createLibraryRepository } from "./library-repository"

/**
 * Proves the real ProseQL engine + korri repository run fully in memory (no
 * file system): seed games through the real repository write path, then read
 * them back through listPlayableEntries. This is the engine guarantee the
 * design-tool / e2e seed adapter is built on.
 */
describe("openInMemoryKorriLibraryDb", () => {
  it("seeds games and lists them back through real ProseQL, no disk", async () => {
    const titles = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openInMemoryKorriLibraryDb()
          const repository = createLibraryRepository(db)

          for (const game of games) {
            yield* repository.upsertGame(game)
          }
          yield* Effect.promise(() => db.flush())

          const entries = yield* repository.listPlayableEntries()
          return entries.map(entry => entry.title ?? entry.id)
        }),
      ),
    )

    expect(titles.length).toBe(games.length)
    expect(titles).toContain("Crystalline Drift")
  })
})
