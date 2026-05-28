import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { GameRecord } from "@shared/library/config/records/game"
import type { LauncherRecord } from "@shared/library/config/records/launcher"
import type { SystemRecord } from "@shared/library/config/records/system"
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

const oldGame: GameRecord = {
  id: "game-old",
  system: "snes",
  contentPath: "/storage/roms/snes/old.smc",
  metadata: { name: "Old" },
  userData: { lastPlayed: new Date("2024-01-01T00:00:00.000Z") },
}

const newGame: GameRecord = {
  id: "game-new",
  system: "snes",
  contentPath: "/storage/roms/snes/new.smc",
  metadata: { name: "New" },
  userData: { lastPlayed: new Date("2026-01-01T00:00:00.000Z") },
}

const neverPlayedGame: GameRecord = {
  id: "game-never",
  system: "snes",
  contentPath: "/storage/roms/snes/never.smc",
  metadata: { name: "Never" },
}

const retroarchLauncher: LauncherRecord = {
  id: "retroarch",
  command: "/bin/echo",
  args: ["-L", "{core}", "{contentPath}"],
  systems: ["snes"],
}

const snesSystem: SystemRecord = {
  id: "snes",
  launcher: "retroarch",
  cores: { retroarch: "snes9x_libretro.so" },
}

describe("createLibraryRepository — listGames", () => {
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
      expect(listed.map(g => g.id)).toEqual([
        "game-new",
        "game-old",
        "game-never",
      ])
    })
  })
})

describe("createLibraryRepository — resolveLaunchForGame (inheritance)", () => {
  it("resolves a LaunchSpec and default Gamescope policy via pure inheritance", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertSystem(snesSystem)
            yield* repo.upsertLauncher(retroarchLauncher)
            yield* repo.upsertGame(newGame)
            return yield* repo.resolveLaunchForGame(newGame.id)
          }),
        ),
      )
      expect(result.spec.command).toBe("/bin/echo")
      expect(result.spec.args).toEqual([
        "-L",
        "snes9x_libretro.so",
        "/storage/roms/snes/new.smc",
      ])
      expect(result.gamescope).toEqual({
        enabled: true,
        backend: "wayland",
        exposeWayland: true,
      })
    })
  })

  it("includes gamescope policy when configured (cascade fold)", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertGlobalConfig({
              gamescope: { enabled: false, args: ["-F", "fsr"] },
            })
            yield* repo.upsertSystem(snesSystem)
            yield* repo.upsertLauncher(retroarchLauncher)
            yield* repo.upsertGame({
              ...newGame,
              gamescope: { enabled: true },
            })
            return yield* repo.resolveLaunchForGame(newGame.id)
          }),
        ),
      )
      expect(result.gamescope?.enabled).toBe(true)
      expect(result.gamescope?.args).toEqual(["-F", "fsr"])
    })
  })

  it("resolves local launcher Gamescope policy without a game id", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertGlobalConfig({ gamescope: { enabled: false } })
            yield* repo.upsertLauncher({
              id: "moonlight",
              command: "moonlight",
              args: [],
              systems: [],
              gamescope: { enabled: true, args: ["--expose-wayland"] },
            })
            return yield* repo.resolveLocalLauncherGamescopePolicy("moonlight")
          }),
        ),
      )

      expect(result).toEqual({
        enabled: true,
        backend: "wayland",
        exposeWayland: true,
        args: ["--expose-wayland"],
      })
    })
  })

  it("honors ephemeral override (most-specific cascade layer)", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertSystem(snesSystem)
            yield* repo.upsertLauncher(retroarchLauncher)
            yield* repo.upsertGame(newGame)
            return yield* repo.resolveLaunchForGame(newGame.id, {
              override: { argsAppend: ["--debug"] },
            })
          }),
        ),
      )
      expect(result.spec.args).toEqual([
        "-L",
        "snes9x_libretro.so",
        "/storage/roms/snes/new.smc",
        "--debug",
      ])
    })
  })
})

describe("createLibraryRepository — resolveLaunchForGame (error paths)", () => {
  it("fails with GameNotFound for an unknown game id", async () => {
    await withTempRoot(async root => {
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            return yield* repo.resolveLaunchForGame("missing")
          }),
        ),
      )
      expect(exit._tag).toBe("Failure")
    })
  })

  it("fails when userId is provided but the user doesn't exist", async () => {
    await withTempRoot(async root => {
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertSystem(snesSystem)
            yield* repo.upsertLauncher(retroarchLauncher)
            yield* repo.upsertGame(newGame)
            return yield* repo.resolveLaunchForGame(newGame.id, {
              userId: "ghost",
            })
          }),
        ),
      )
      expect(exit._tag).toBe("Failure")
    })
  })
})

describe("createLibraryRepository — upsertImportedGame", () => {
  it("writes a single-system import atomically (game + launcher + system delta)", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertImportedGame({
              game: newGame,
              launcher: retroarchLauncher,
              systemDelta: {
                id: "snes",
                name: "Super Nintendo",
                cores: { retroarch: "snes9x_libretro.so" },
              },
            })
            yield* Effect.promise(() => db.flush())
            const games = yield* repo.listGames()
            const resolved = yield* repo.resolveLaunchForGame(newGame.id)
            return { games, resolved }
          }),
        ),
      )
      expect(result.games.map(g => g.id)).toEqual([newGame.id])
      expect(result.resolved.spec.args).toEqual([
        "-L",
        "snes9x_libretro.so",
        "/storage/roms/snes/new.smc",
      ])
    })
  })

  it("merges supported systems when importing a second game on the same launcher", async () => {
    await withTempRoot(async root => {
      const launcher = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertImportedGame({
              game: newGame,
              launcher: { ...retroarchLauncher, systems: ["snes"] },
              systemDelta: {
                id: "snes",
                cores: { retroarch: "snes9x_libretro.so" },
              },
            })
            yield* repo.upsertImportedGame({
              game: {
                id: "ridge-racer",
                system: "psx",
                contentPath: "/storage/roms/psx/ridge.bin",
              },
              launcher: { ...retroarchLauncher, systems: ["psx"] },
              systemDelta: {
                id: "psx",
                cores: { retroarch: "pcsx_rearmed_libretro.so" },
              },
            })
            yield* Effect.promise(() => db.flush())
            return yield* Effect.promise(() =>
              db.launchers.findById("retroarch").pipe(Effect.runPromise),
            )
          }),
        ),
      )
      expect([...launcher.systems].sort()).toEqual(["psx", "snes"])
    })
  })
})
