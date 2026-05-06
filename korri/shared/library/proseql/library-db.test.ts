import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"

import {
  KORRI_LIBRARY_SCHEMA_VERSION,
  makeKorriLibraryDbConfig,
  openKorriLibraryDb,
} from "./library-db"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-library-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function seedGame(id = "snes/f-zero.smc") {
  return {
    id,
    metadata: { name: "F-Zero" },
    userData: { lastPlayed: new Date("2026-01-02T03:04:05.000Z") },
  }
}

describe("openKorriLibraryDb", () => {
  it("writes, flushes, and reopens a game with a launch target", async () => {
    await withTempRoot(async root => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const game = seedGame()

            yield* db.games.create(game)
            yield* db.launchTargets.create({
              id: `launch:${game.id}`,
              gameId: game.id,
              spec: {
                command: "/usr/bin/runemu.sh",
                args: ["/storage/roms/snes/f-zero.smc", "-Psnes"],
              },
            })
            yield* Effect.promise(() => db.flush())
          }),
        ),
      )

      const gamesFile = await readFile(join(root, "games.yaml"), "utf8")
      const launchTargetsFile = await readFile(
        join(root, "launch-targets.yaml"),
        "utf8",
      )
      expect(gamesFile).toContain(`_version: ${KORRI_LIBRARY_SCHEMA_VERSION}`)
      expect(gamesFile).toContain("snes/f-zero.smc:")
      expect(gamesFile).toContain("F-Zero")
      expect(gamesFile).not.toContain("  id: snes/f-zero.smc")
      expect(launchTargetsFile).toContain("launch:snes/f-zero.smc:")
      expect(launchTargetsFile).toContain("gameId: snes/f-zero.smc")
      expect(launchTargetsFile).not.toContain("  id: launch:snes/f-zero.smc")

      const reopened = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const game = yield* db.games.findById("snes/f-zero.smc")
            const launchTarget = yield* db.launchTargets.findById(
              "launch:snes/f-zero.smc",
            )
            return { game, launchTarget }
          }),
        ),
      )

      expect(reopened.game.metadata?.name).toBe("F-Zero")
      expect(reopened.launchTarget.spec.command).toBe("/usr/bin/runemu.sh")
    })
  })

  it("opens an empty root as empty collections", async () => {
    await withTempRoot(async root => {
      const games = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            return yield* Effect.promise(() => db.games.query().runPromise)
          }),
        ),
      )

      expect(games).toEqual([])
    })
  })

  it("rejects invalid persisted records through the ProseQL open effect", async () => {
    await withTempRoot(async root => {
      await mkdir(root, { recursive: true })
      await writeFile(
        join(root, "games.yaml"),
        [
          "bad:",
          "  metadata:",
          "    name: 123",
          `_version: ${KORRI_LIBRARY_SCHEMA_VERSION}`,
          "",
        ].join("\n"),
        "utf8",
      )

      const exit = await Effect.runPromiseExit(
        Effect.scoped(openKorriLibraryDb({ root, writeDebounce: 1 })),
      )

      expect(exit._tag).toBe("Failure")
    })
  })

  it("declares the expected collection files", () => {
    const config = makeKorriLibraryDbConfig("/tmp/korri-library")

    expect(config.games.file).toBe("/tmp/korri-library/games.yaml")
    expect(config.games.id).toEqual({ kind: "derivedFromKey", field: "id" })
    expect(config.launchTargets.file).toBe(
      "/tmp/korri-library/launch-targets.yaml",
    )
    expect(config.launchTargets.id).toEqual({
      kind: "derivedFromKey",
      field: "id",
    })
  })
})
