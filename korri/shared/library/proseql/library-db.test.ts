import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"

import { makeKorriLibraryDbConfig, openKorriLibraryDb } from "./library-db"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-library-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("makeKorriLibraryDbConfig", () => {
  it("declares the collections expected by the cascade and game-assets models", () => {
    const config = makeKorriLibraryDbConfig("/tmp/x")
    const names = Object.keys(config.collections).sort()
    expect(names).toEqual([
      "apps",
      "collections",
      "config",
      "game-asset-assignments",
      "game-assets",
      "games",
      "launchers",
      "modules",
      "systems",
      "users",
    ])
  })

  it("declares a single 'documents' source rooted at the library directory", () => {
    const config = makeKorriLibraryDbConfig("/tmp/x")
    expect(config.sources.length).toBe(1)
    const src = config.sources[0]
    expect(src?.kind).toBe("documents")
    expect(src?.root).toBe("/tmp/x")
    expect(src?.collections).toBe("all")
    expect(src?.outbox).toBe("library.yaml")
  })

  it("uses derivedFromKey for every collection", () => {
    const config = makeKorriLibraryDbConfig("/tmp/x")
    for (const [name, col] of Object.entries(config.collections)) {
      expect(col.id, name).toEqual({ kind: "derivedFromKey", field: "id" })
    }
  })
})

describe("openKorriLibraryDb — empty root", () => {
  it("opens an empty root as empty collections", async () => {
    await withTempRoot(async root => {
      const counts = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            return {
              config: (yield* Effect.promise(
                () => db.config.query().runPromise,
              )).length,
              users: (yield* Effect.promise(() => db.users.query().runPromise))
                .length,
              systems: (yield* Effect.promise(
                () => db.systems.query().runPromise,
              )).length,
              launchers: (yield* Effect.promise(
                () => db.launchers.query().runPromise,
              )).length,
              apps: (yield* Effect.promise(() => db.apps.query().runPromise))
                .length,
              modules: (yield* Effect.promise(
                () => db.modules.query().runPromise,
              )).length,
              games: (yield* Effect.promise(() => db.games.query().runPromise))
                .length,
              "game-assets": (yield* Effect.promise(
                () => db["game-assets"].query().runPromise,
              )).length,
              "game-asset-assignments": (yield* Effect.promise(
                () => db["game-asset-assignments"].query().runPromise,
              )).length,
              collections: (yield* Effect.promise(
                () => db.collections.query().runPromise,
              )).length,
            }
          }),
        ),
      )
      expect(counts).toEqual({
        config: 0,
        users: 0,
        systems: 0,
        launchers: 0,
        apps: 0,
        modules: 0,
        games: 0,
        "game-assets": 0,
        "game-asset-assignments": 0,
        collections: 0,
      })
    })
  })
})

describe("openKorriLibraryDb — single-file multi-collection round-trip", () => {
  it("persists multiple collections into one outbox YAML file (round-trip)", async () => {
    await withTempRoot(async root => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            yield* db.games.create({
              id: "fzero",
              system: "snes",
              contentPath: "/storage/roms/snes/f-zero.smc",
              metadata: { name: "F-Zero" },
            })
            yield* db.systems.create({ id: "snes", name: "Super Nintendo" })
            yield* db.launchers.create({
              id: "retroarch",
              command: "/usr/bin/retroarch",
              args: ["{contentPath}"],
              systems: ["snes"],
            })
            yield* Effect.promise(() => db.flush())
          }),
        ),
      )

      const outbox = await readFile(join(root, "library.yaml"), "utf8")
      expect(outbox).toContain("games:")
      expect(outbox).toContain("systems:")
      expect(outbox).toContain("launchers:")
      expect(outbox).toContain("fzero:")
      expect(outbox).toContain("snes:")
      expect(outbox).toContain("retroarch:")
      // Key-derived id rule: no nested `id:` field for each record.
      expect(outbox).not.toContain("  id: fzero")

      // Reopen and read.
      const reopened = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            return {
              game: yield* db.games.findById("fzero"),
              system: yield* db.systems.findById("snes"),
              launcher: yield* db.launchers.findById("retroarch"),
            }
          }),
        ),
      )
      expect(reopened.game.system).toBe("snes")
      expect(reopened.game.contentPath).toBe("/storage/roms/snes/f-zero.smc")
      expect(reopened.system.name).toBe("Super Nintendo")
      expect(reopened.launcher.systems).toEqual(["snes"])
    })
  })

  it("merges two files contributing to the same collection", async () => {
    await withTempRoot(async root => {
      await writeFile(
        join(root, "snes.yaml"),
        [
          "systems:",
          "  snes:",
          "    name: Super Nintendo",
          "games:",
          "  fzero:",
          "    system: snes",
          "    contentPath: /storage/roms/snes/f-zero.smc",
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        join(root, "psx.yaml"),
        [
          "systems:",
          "  psx:",
          "    name: PlayStation",
          "games:",
          "  ridge-racer:",
          "    system: psx",
          "    contentPath: /storage/roms/psx/ridge-racer.bin",
          "",
        ].join("\n"),
        "utf8",
      )

      const counts = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            return {
              games: (yield* Effect.promise(() => db.games.query().runPromise))
                .length,
              systems: (yield* Effect.promise(
                () => db.systems.query().runPromise,
              )).length,
            }
          }),
        ),
      )
      expect(counts).toEqual({ games: 2, systems: 2 })
    })
  })
})

describe("openKorriLibraryDb — strict-mode rejections", () => {
  it("rejects a YAML file with an unknown top-level collection key", async () => {
    await withTempRoot(async root => {
      await mkdir(root, { recursive: true })
      await writeFile(
        join(root, "library.yaml"),
        ["launchTargets:", "  legacy-key:", "    gameId: x", ""].join("\n"),
        "utf8",
      )
      const exit = await Effect.runPromiseExit(
        Effect.scoped(openKorriLibraryDb({ root, writeDebounce: 1 })),
      )
      expect(exit._tag).toBe("Failure")
    })
  })

  it("rejects a config: section containing any key other than 'global'", async () => {
    await withTempRoot(async root => {
      await writeFile(
        join(root, "library.yaml"),
        ["config:", "  notglobal:", "    launcher: retroarch", ""].join("\n"),
        "utf8",
      )
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            return yield* Effect.promise(() => db.config.query().runPromise)
          }),
        ),
      )
      expect(exit._tag).toBe("Failure")
    })
  })
})
