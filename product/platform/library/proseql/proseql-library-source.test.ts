import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
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

  it("reports multi-release playable entries as launchable even when launch resolution would require a release choice", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repo = createLibraryRepository(db)
            yield* repo.upsertStorage({ id: "roms", root: root })
            yield* repo.upsertSource({
              id: "local-roms",
              kind: ["files"],
              storage: "roms",
            })
            yield* repo.upsertApp({
              id: "echo",
              command: "/bin/echo",
              args: ["{target}"],
              systems: ["genesis", "pc"],
            })
            yield* repo.upsertLibraryItem({
              id: "sonic",
              source: "local-roms",
              releases: [
                {
                  id: "genesis",
                  system: "genesis",
                  app: "echo",
                  target: "sonic.md",
                },
                {
                  id: "steam",
                  system: "pc",
                  app: "echo",
                  target: "sonic-steam.bin",
                },
                { id: "known-only", system: "pc", app: "echo" },
              ],
            })
            yield* Effect.promise(() => db.flush())

            const source = createProseqlLibrarySource(repo)
            const canResolve = source.canResolveLaunchForGame
            if (!canResolve) throw new Error("expected canResolveLaunchForGame")
            return {
              anyRelease: yield* Effect.promise(() => canResolve("sonic")),
              steam: yield* Effect.promise(() =>
                canResolve("sonic", {
                  releaseId: "steam",
                }),
              ),
              knownOnly: yield* Effect.promise(() =>
                canResolve("sonic", {
                  releaseId: "known-only",
                }),
              ),
            }
          }),
        ),
      )

      expect(result).toEqual({
        anyRelease: true,
        steam: true,
        knownOnly: false,
      })
    })
  })

  it("resolves legacy patch-bearing games through the readable launch path", async () => {
    await withTempRoot(async root => {
      const previous = {
        artifacts: process.env.KORRI_LAUNCH_ARTIFACTS_DIR,
        data: process.env.XDG_DATA_HOME,
        state: process.env.XDG_STATE_HOME,
      }
      process.env.KORRI_LAUNCH_ARTIFACTS_DIR = join(root, "launch-artifacts")
      process.env.XDG_DATA_HOME = join(root, "data")
      process.env.XDG_STATE_HOME = join(root, "state")
      try {
        const rom = join(root, "roms", "game.gba")
        const patch = join(root, "patches", "color.ips")
        await mkdir(join(root, "roms"), { recursive: true })
        await mkdir(join(root, "patches"), { recursive: true })
        await writeFile(rom, "rom")
        await writeFile(patch, "patch")

        const result = await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
              const repo = createLibraryRepository(db)
              yield* repo.upsertSystem({
                id: "gba",
                launch: { app: "retroarch", module: "mgba" },
              })
              yield* repo.upsertRuntime({
                id: "mgba",
                kind: "libretro-core",
                path: "/cores/mgba_libretro.so",
              })
              yield* repo.upsertLauncher({
                id: "retroarch",
                command: "/bin/echo",
                args: ["{contentPath}"],
                systems: ["gba"],
              })
              yield* repo.upsertGame({
                id: "gba/game",
                system: "gba",
                contentPath: rom,
                patches: [patch],
              })
              const source = createProseqlLibrarySource(repo)
              return yield* Effect.promise(() =>
                source.resolveLaunchForGame("gba/game"),
              )
            }),
          ),
        )

        expect(result.spec.args).toEqual([
          "-c",
          expect.stringMatching(/retroarch\.cfg$/),
          "-L",
          "/cores/mgba_libretro.so",
          expect.stringMatching(/game\.gba$/),
        ])
        expect(result.artifacts?.paths.configPath).toBe(result.spec.args[1])
      } finally {
        setEnv("KORRI_LAUNCH_ARTIFACTS_DIR", previous.artifacts)
        setEnv("XDG_DATA_HOME", previous.data)
        setEnv("XDG_STATE_HOME", previous.state)
      }
    })
  })

  it("resolves checked-in expanded RetroArch examples through the library source seam", async () => {
    await withTempRoot(async root => {
      const previous = process.env.KORRI_LAUNCH_ARTIFACTS_DIR
      process.env.KORRI_LAUNCH_ARTIFACTS_DIR = join(root, "launch-artifacts")
      try {
        await writeFile(
          join(root, "library.yaml"),
          await readFile("korri-catalog-display-metadata.example.yaml", "utf8"),
          "utf8",
        )

        const result = await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
              const source = createProseqlLibrarySource(
                createLibraryRepository(db),
              )
              const canResolve = source.canResolveLaunchForGame
              if (!canResolve)
                throw new Error("expected canResolveLaunchForGame")
              return {
                canResolve: yield* Effect.promise(() =>
                  canResolve("sonic-the-hedgehog", { releaseId: "genesis" }),
                ),
                resolved: yield* Effect.promise(() =>
                  source.resolveLaunchForGame("sonic-the-hedgehog", {
                    releaseId: "genesis",
                  }),
                ),
              }
            }),
          ),
        )

        expect(result.canResolve).toBe(true)
        expect(result.resolved.spec.args).toEqual([
          "-c",
          expect.stringMatching(/retroarch\.cfg$/),
          "-L",
          "/run/current-system/sw/lib/libretro/genesis_plus_gx_libretro.so",
          "/roms/genesis/Sonic The Hedgehog.md",
        ])
        const config = await readFile(
          String(result.resolved.artifacts?.paths.configPath),
          "utf8",
        )
        expect(config).toContain("aspect_ratio_index = 24")
        expect(config).toContain("video_frame_delay = 0")
        expect(config).toContain("rewind_buffer_size = 20")
      } finally {
        setEnv("KORRI_LAUNCH_ARTIFACTS_DIR", previous)
      }
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
