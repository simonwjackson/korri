import { describe, expect, it } from "bun:test"
import { openKorriLibraryDb } from "@platform/library/proseql/library-db"
import { createLibraryRepository } from "@platform/library/proseql/library-repository"
import { Effect } from "effect"
import { withTempProseqlLibrary } from "./with-temp-proseql-library"

describe("withTempProseqlLibrary", () => {
  it("seeds the six collections through real ProseQL + real disk", async () => {
    await using library = await withTempProseqlLibrary({
      global: { launch: { with: { "@example:wrapper": { enable: false } } } },
      systems: [{ id: "snes" }],
      launchers: [
        {
          id: "echo",
          command: "/bin/echo",
          args: ["-L", "{runtime.path}", "{content.path}"],
          systems: ["snes"],
        },
      ],
      runtimes: [
        {
          id: "snes9x_libretro.so",
          kind: "libretro-core",
          path: "/legacy-cores/snes9x_libretro.so",
        },
      ],
      games: [
        {
          id: "game-1",
          system: "snes",
          contentPath: "/storage/roms/snes/game-1.smc",
          launch: { app: "echo", module: "snes9x_libretro.so" },
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
    expect(
      (
        result.resolved.launchCompanions?.["@example:wrapper"] as
          | { readonly enable?: boolean }
          | undefined
      )?.enable,
    ).toBe(false)
  })
})
