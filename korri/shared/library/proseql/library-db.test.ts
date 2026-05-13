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

function seedGame(id = "25afeac6-f68c-4d44-b42e-87ec4c0a436b") {
  return {
    id,
    metadata: { name: "F-Zero" },
    userData: { lastPlayed: new Date("2026-01-02T03:04:05.000Z") },
  }
}

const launcherProfile = {
  id: "rocknix.retroarch.snes",
  command: "/usr/bin/runemu.sh",
  args: ["{contentPath}", "-P{system}"],
  defaults: { system: "snes" },
}

describe("openKorriLibraryDb", () => {
  it("writes, flushes, and reopens a game with a profile-backed launch target", async () => {
    await withTempRoot(async root => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const game = seedGame()

            yield* db.games.create(game)
            yield* db.launcherProfiles.create(launcherProfile)
            const launchTarget = {
              id: game.id,
              profile: launcherProfile.id,
              contentPath: "/storage/roms/snes/f-zero.smc",
            }
            yield* db.launchTargets.create(launchTarget as never)
            yield* Effect.promise(() => db.flush())
          }),
        ),
      )

      const gamesFile = await readFile(join(root, "games.yaml"), "utf8")
      const profilesFile = await readFile(
        join(root, "launcher-profiles.yaml"),
        "utf8",
      )
      const launchTargetsFile = await readFile(
        join(root, "launch-targets.yaml"),
        "utf8",
      )
      expect(gamesFile).toContain(`_version: ${KORRI_LIBRARY_SCHEMA_VERSION}`)
      expect(gamesFile).toContain(`${seedGame().id}:`)
      expect(gamesFile).toContain("F-Zero")
      expect(gamesFile).not.toContain(`  id: ${seedGame().id}`)
      expect(profilesFile).toContain("rocknix.retroarch.snes:")
      expect(launchTargetsFile).toContain(`${seedGame().id}:`)
      expect(launchTargetsFile).toContain("profile: rocknix.retroarch.snes")
      expect(launchTargetsFile).toContain(
        "contentPath: /storage/roms/snes/f-zero.smc",
      )
      expect(launchTargetsFile).not.toContain(`  id: ${seedGame().id}`)

      const reopened = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const game = yield* db.games.findById(seedGame().id)
            const profile = yield* db.launcherProfiles.findById(
              launcherProfile.id,
            )
            const launchTarget = yield* db.launchTargets.findById(seedGame().id)
            return { game, profile, launchTarget }
          }),
        ),
      )

      expect(reopened.game.metadata?.name).toBe("F-Zero")
      expect(reopened.profile.command).toBe("/usr/bin/runemu.sh")
      expect("profile" in reopened.launchTarget).toBe(true)
      if ("profile" in reopened.launchTarget) {
        expect(reopened.launchTarget.profile).toBe("rocknix.retroarch.snes")
      }
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

  it("declares the expected default collection files", () => {
    const config = makeKorriLibraryDbConfig("/tmp/korri-library")

    expect(config.games.file).toBe("/tmp/korri-library/games.yaml")
    expect(config.games.id).toEqual({ kind: "derivedFromKey", field: "id" })
    expect(config.launcherProfiles.file).toBe(
      "/tmp/korri-library/launcher-profiles.yaml",
    )
    expect(config.launcherProfiles.id).toEqual({
      kind: "derivedFromKey",
      field: "id",
    })
    expect(config.launchTargets.file).toBe(
      "/tmp/korri-library/launch-targets.yaml",
    )
    expect(config.launchTargets.id).toEqual({
      kind: "derivedFromKey",
      field: "id",
    })
  })
})
