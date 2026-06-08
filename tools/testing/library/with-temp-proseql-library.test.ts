import { describe, expect, it } from "bun:test"
import { openKorriLibraryDb } from "@platform/library/proseql/library-db"
import { createLibraryRepository } from "@platform/library/proseql/library-repository"
import { Effect } from "effect"
import { withTempProseqlLibrary } from "./with-temp-proseql-library"

describe("withTempProseqlLibrary", () => {
  it("seeds the six collections through real ProseQL + real disk", async () => {
    await using library = await withTempProseqlLibrary({
      global: { gamescope: { enable: false } },
      systems: [
        {
          id: "snes",
          launcher: "echo",
          cores: { echo: "snes9x_libretro.so" },
        },
      ],
      launchers: [
        {
          id: "echo",
          command: "/bin/echo",
          args: ["-L", "{core}", "{contentPath}"],
          systems: ["snes"],
        },
      ],
      games: [
        {
          id: "game-1",
          system: "snes",
          contentPath: "/storage/roms/snes/game-1.smc",
          metadata: { name: "Game 1" },
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
            resolved: yield* repository.resolveLaunchForGame("game-1"),
          }
        }),
      ),
    )

    expect(result.games.map(g => g.id)).toEqual(["game-1"])
    expect(result.resolved.spec.args).toEqual([
      "-L",
      "/legacy-cores/snes9x_libretro.so",
      "/storage/roms/snes/game-1.smc",
    ])
    expect(result.resolved.gamescope?.enable).toBe(false)
  })
})
