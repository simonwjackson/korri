import { describe, expect, it } from "bun:test"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { createLibraryRepository } from "@shared/library/proseql/library-repository"
import { Effect } from "effect"
import { withTempProseqlLibrary } from "./with-temp-proseql-library"

describe("withTempProseqlLibrary", () => {
  it("seeds games, launcher profiles, and launch targets in a real ProseQL root", async () => {
    await using library = await withTempProseqlLibrary({
      games: [{ id: "game-1", metadata: { name: "Game 1" } }],
      launcherProfiles: [
        {
          id: "echo.profile",
          command: "/bin/echo",
          args: ["{contentPath}"],
        },
      ],
      launchTargets: [
        {
          id: "game-1",
          profile: "echo.profile",
          contentPath: "content with spaces.smc",
        },
      ],
    })

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openKorriLibraryDb({
            root: library.root,
            writeDebounce: 1,
          })
          const repository = createLibraryRepository(db)
          return {
            games: yield* repository.listGames(),
            spec: yield* repository.launchSpecForGame("game-1"),
          }
        }),
      ),
    )

    expect(result.games.map(game => game.id)).toEqual(["game-1"])
    expect(result.spec).toEqual({
      command: "/bin/echo",
      args: ["content with spaces.smc"],
    })
  })
})
