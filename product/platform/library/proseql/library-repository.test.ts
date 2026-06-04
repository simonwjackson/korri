import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { GameRecord } from "@platform/library/config/records/game"
import type { LauncherRecord } from "@platform/library/config/records/launcher"
import type { SystemRecord } from "@platform/library/config/records/system"
import { LibraryError } from "@platform/library/library-services"
import { Cause, Effect, Result } from "effect"

import { openKorriLibraryDb } from "./library-db"
import { createLibraryRepository } from "./library-repository"

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-repository-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function expectLibraryFailure(
  exit: Awaited<ReturnType<typeof Effect.runPromiseExit>>,
  message: string,
) {
  expect(exit._tag).toBe("Failure")
  if (exit._tag !== "Failure") return
  const failure = Cause.findFail(exit.cause)
  expect(Result.isSuccess(failure)).toBe(true)
  if (Result.isFailure(failure)) return
  expect(failure.success.error).toBeInstanceOf(LibraryError)
  expect((failure.success.error as LibraryError).message).toContain(message)
}

async function withLaunchArtifactsRoot<T>(
  fn: (root: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-launch-artifacts-"))
  const previous = process.env.KORRI_LAUNCH_ARTIFACTS_DIR
  process.env.KORRI_LAUNCH_ARTIFACTS_DIR = root
  try {
    return await fn(root)
  } finally {
    if (previous === undefined) {
      delete process.env.KORRI_LAUNCH_ARTIFACTS_DIR
    } else {
      process.env.KORRI_LAUNCH_ARTIFACTS_DIR = previous
    }
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

const snesRomBytes = Buffer.from("SNES ROM BYTES")
const smbrLevelBytes = Buffer.from('{"Info":{"Name":"Island"},"Levels":[{}]}')
const ipsPatchBytes = Buffer.from("PATCH BYTES")

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

  it("resolves artifact-backed game content to the durable blob path before launch composition", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const env = {
              KORRI_LIBRARY_ROOT: root,
              KORRI_ARTIFACTS_ROOT: join(root, "artifacts"),
            }
            const repo = createLibraryRepository(db, { env })
            const artifact = yield* repo.adoptArtifact({
              source: { kind: "bytes", bytes: snesRomBytes },
              artifact: {
                kind: "content",
                system: "snes",
                format: { id: "sfc-rom" },
                file: { name: "f-zero.sfc", extension: "sfc" },
              },
              library: { createGame: false },
            })
            yield* repo.upsertSystem(snesSystem)
            yield* repo.upsertLauncher(retroarchLauncher)
            yield* repo.upsertGame({
              id: "artifact-fzero",
              system: "snes",
              content: { artifactId: artifact.artifact.id },
            })
            return yield* repo.resolveLaunchForGame("artifact-fzero")
          }),
        ),
      )

      expect(result.spec.args).toEqual([
        "-L",
        "snes9x_libretro.so",
        join(
          root,
          "artifacts",
          "blobs",
          "sha256",
          sha256(snesRomBytes).slice(0, 2),
          `${sha256(snesRomBytes)}.sfc`,
        ),
      ])
      expect(result.content).toEqual({
        artifactId: `sha256:${sha256(snesRomBytes)}`,
      })
    })
  })

  it("resolves SMBR artifact-backed level content as normal local content", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const env = {
              KORRI_LIBRARY_ROOT: root,
              KORRI_ARTIFACTS_ROOT: join(root, "artifacts"),
            }
            const repo = createLibraryRepository(db, { env })
            const artifact = yield* repo.adoptArtifact({
              source: { kind: "bytes", bytes: smbrLevelBytes },
              artifact: {
                kind: "content",
                system: "smbr",
                format: { id: "smbr-level" },
                file: { name: "island.lvl", extension: "lvl" },
              },
              library: { createGame: false },
            })
            yield* repo.upsertSystem({ id: "smbr", launcher: "smbr" })
            yield* repo.upsertLauncher({
              id: "smbr",
              command: "/bin/echo",
              args: ["--level", "{contentPath}"],
              systems: ["smbr"],
            })
            yield* repo.upsertGame({
              id: "smbr-island",
              system: "smbr",
              content: { artifactId: artifact.artifact.id },
            })
            return yield* repo.resolveLaunchForGame("smbr-island")
          }),
        ),
      )

      expect(result.spec.args.at(-1)).toBe(
        join(
          root,
          "artifacts",
          "blobs",
          "sha256",
          sha256(smbrLevelBytes).slice(0, 2),
          `${sha256(smbrLevelBytes)}.lvl`,
        ),
      )
    })
  })

  it("fails clearly when an artifact-backed game references a missing artifact", async () => {
    await withTempRoot(async root => {
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db, {
              env: {
                KORRI_LIBRARY_ROOT: root,
                KORRI_ARTIFACTS_ROOT: join(root, "artifacts"),
              },
            })
            yield* repo.upsertSystem(snesSystem)
            yield* repo.upsertLauncher(retroarchLauncher)
            yield* repo.upsertGame({
              id: "missing-artifact",
              system: "snes",
              content: {
                artifactId:
                  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              },
            })
            return yield* repo.resolveLaunchForGame("missing-artifact")
          }),
        ),
      )

      expectLibraryFailure(exit, "artifact not found")
    })
  })

  it("fails clearly when an artifact-backed game references a missing blob", async () => {
    await withTempRoot(async root => {
      const blobPath = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db, {
              env: {
                KORRI_LIBRARY_ROOT: root,
                KORRI_ARTIFACTS_ROOT: join(root, "artifacts"),
              },
            })
            yield* repo.upsertSystem(snesSystem)
            yield* repo.upsertLauncher(retroarchLauncher)
            const adopted = yield* repo.adoptArtifact({
              source: { kind: "bytes", bytes: snesRomBytes },
              artifact: {
                kind: "content",
                system: "snes",
                format: { id: "sfc-rom" },
                file: { name: "f-zero.sfc", extension: "sfc" },
              },
              library: { createGame: true, gameId: "missing-blob" },
            })
            return adopted.artifact.localPath
          }),
        ),
      )
      expect(blobPath).toBeDefined()
      await rm(blobPath as string)

      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db, {
              env: {
                KORRI_LIBRARY_ROOT: root,
                KORRI_ARTIFACTS_ROOT: join(root, "artifacts"),
              },
            })
            return yield* repo.resolveLaunchForGame("missing-blob")
          }),
        ),
      )

      expectLibraryFailure(exit, "artifact blob missing from store")
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

describe("createLibraryRepository — adoptArtifact", () => {
  it("adopts SNES content bytes into an artifact record and artifact-backed game", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db, {
              env: {
                KORRI_LIBRARY_ROOT: root,
                KORRI_ARTIFACTS_ROOT: join(root, "artifacts"),
              },
            })
            return yield* repo.adoptArtifact({
              source: { kind: "bytes", bytes: snesRomBytes },
              artifact: {
                kind: "content",
                system: "snes",
                format: { id: "sfc-rom" },
                file: { name: "f-zero.sfc", extension: "sfc" },
                facets: { title: { text: "F-Zero" } },
              },
              library: { createGame: true, gameId: "snes-fzero" },
            })
          }),
        ),
      )

      expect(result.artifact.id).toBe(`sha256:${sha256(snesRomBytes)}`)
      expect(result.game).toMatchObject({
        id: "snes-fzero",
        system: "snes",
        content: { artifactId: `sha256:${sha256(snesRomBytes)}` },
        metadata: { name: "F-Zero" },
      })
      expect(result.game?.contentPath).toBeUndefined()
    })
  })

  it("adopts SMBR levels as normal artifact-backed game records without source-specific launcher data", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db, {
              env: {
                KORRI_LIBRARY_ROOT: root,
                KORRI_ARTIFACTS_ROOT: join(root, "artifacts"),
              },
            })
            return yield* repo.adoptArtifact({
              source: { kind: "bytes", bytes: smbrLevelBytes },
              artifact: {
                kind: "content",
                system: "smbr",
                format: { id: "smbr-level" },
                file: { name: "island.lvl", extension: "lvl" },
                facets: { title: { text: "Island" } },
                sourceData: { "levelsharesquare.v1": { levelId: "abc" } },
              },
              library: { createGame: true, gameId: "smbr-island" },
            })
          }),
        ),
      )

      expect(result.game).toMatchObject({
        id: "smbr-island",
        system: "smbr",
        content: { artifactId: `sha256:${sha256(smbrLevelBytes)}` },
        metadata: { name: "Island" },
      })
      expect(result.game).not.toHaveProperty("launch")
      expect(result.game).not.toHaveProperty("launcher")
      expect(result.game).not.toHaveProperty("core")
    })
  })

  it("adopts patch artifacts without creating a game by default", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db, {
              env: {
                KORRI_LIBRARY_ROOT: root,
                KORRI_ARTIFACTS_ROOT: join(root, "artifacts"),
              },
            })
            return yield* repo.adoptArtifact({
              source: { kind: "bytes", bytes: ipsPatchBytes },
              artifact: {
                kind: "patch",
                format: { id: "ips" },
                file: { name: "translation.ips", extension: "ips" },
              },
            })
          }),
        ),
      )

      expect(result.artifact.kind).toBe("patch")
      expect(result.game).toBeUndefined()
    })
  })

  it("reuses existing artifacts for duplicate bytes", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db, {
              env: {
                KORRI_LIBRARY_ROOT: root,
                KORRI_ARTIFACTS_ROOT: join(root, "artifacts"),
              },
            })
            const first = yield* repo.adoptArtifact({
              source: { kind: "bytes", bytes: snesRomBytes },
              artifact: {
                kind: "content",
                system: "snes",
                format: { id: "sfc-rom" },
                file: { name: "first.sfc", extension: "sfc" },
              },
              library: { createGame: true, gameId: "first" },
            })
            const second = yield* repo.adoptArtifact({
              source: { kind: "bytes", bytes: snesRomBytes },
              artifact: {
                kind: "content",
                system: "snes",
                format: { id: "smc-rom" },
                file: { name: "second.smc", extension: "smc" },
              },
              library: { createGame: true, gameId: "second" },
            })
            return { first, second }
          }),
        ),
      )

      expect(result.second.artifact.id).toBe(result.first.artifact.id)
      expect(result.second.artifact.file.extension).toBe("sfc")
      expect(result.second.game?.content?.artifactId).toBe(
        result.first.artifact.id,
      )
    })
  })

  it("fails content game adoption clearly when no system is available", async () => {
    await withTempRoot(async root => {
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db, {
              env: {
                KORRI_LIBRARY_ROOT: root,
                KORRI_ARTIFACTS_ROOT: join(root, "artifacts"),
              },
            })
            return yield* repo.adoptArtifact({
              source: { kind: "bytes", bytes: snesRomBytes },
              artifact: {
                kind: "content",
                format: { id: "sfc-rom" },
                file: { name: "f-zero.sfc", extension: "sfc" },
              },
              library: { createGame: true, gameId: "missing-system" },
            })
          }),
        ),
      )

      expectLibraryFailure(exit, "content artifact adoption requires a system")
    })
  })

  it("converges manual file and staged file imports for identical bytes", async () => {
    await withTempRoot(async root => {
      const manualPath = join(root, "manual.sfc")
      const stagedPath = join(root, "staged.sfc")
      await writeFile(manualPath, snesRomBytes)
      await writeFile(stagedPath, snesRomBytes)

      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db, {
              env: {
                KORRI_LIBRARY_ROOT: root,
                KORRI_ARTIFACTS_ROOT: join(root, "artifacts"),
              },
            })
            const manual = yield* repo.adoptArtifact({
              source: { kind: "file", sourcePath: manualPath },
              artifact: {
                kind: "content",
                system: "snes",
                format: { id: "sfc-rom" },
                file: { name: "manual.sfc", extension: "sfc" },
              },
              library: { createGame: false },
            })
            const staged = yield* repo.adoptArtifact({
              source: { kind: "file", sourcePath: stagedPath },
              artifact: {
                kind: "content",
                system: "snes",
                format: { id: "sfc-rom" },
                file: { name: "staged.sfc", extension: "sfc" },
              },
              library: { createGame: false },
            })
            return { manual, staged }
          }),
        ),
      )

      expect(result.staged.artifact.id).toBe(result.manual.artifact.id)
      expect(
        await readFile(result.manual.artifact.localPath ?? "missing"),
      ).toEqual(snesRomBytes)
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

describe("createLibraryRepository — resolveLaunchForGame (apps/modules)", () => {
  it("resolves built-in app/module YAML through materialization without a legacy launcher", async () => {
    await withLaunchArtifactsRoot(async () =>
      withTempRoot(async root => {
        const result = await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
              const repo = createLibraryRepository(db)
              yield* repo.upsertApp({
                id: "retroarch",
                settings: { video_driver: "glcore" },
              })
              yield* repo.upsertModule({
                id: "fake08",
                kind: "libretro-core",
                path: "/etc/korri/cores/fake08_libretro.so",
              })
              yield* repo.upsertSystem({
                id: "pico8",
                launch: {
                  app: "retroarch",
                  module: "fake08",
                  settings: { video_scale_integer: true },
                },
              })
              yield* repo.upsertGame({
                id: "porklike",
                system: "pico8",
                contentPath: "/storage/roms/pico8/porklike.p8",
                launch: { settings: { video_scale_integer: false } },
              })
              return yield* repo.resolveLaunchForGame("porklike")
            }),
          ),
        )

        expect(result.app).toEqual({
          id: "retroarch",
          integration: "retroarch",
        })
        expect(result.module).toEqual({
          id: "fake08",
          path: "/etc/korri/cores/fake08_libretro.so",
        })
        expect(result.settings).toMatchObject({
          video_driver: "glcore",
          video_scale_integer: false,
        })
        const configPath = result.artifacts?.paths.configPath
        expect(typeof configPath).toBe("string")
        expect(result.spec.command).toBe("retroarch")
        expect(result.spec.args).toEqual([
          "--config",
          configPath ?? "",
          "-L",
          "/etc/korri/cores/fake08_libretro.so",
          "/storage/roms/pico8/porklike.p8",
        ])
      }),
    )
  })
})
