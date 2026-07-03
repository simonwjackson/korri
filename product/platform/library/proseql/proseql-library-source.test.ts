import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { plugin } from "@platform/plugin"
import { createPluginRegistry } from "@platform/plugin/registry"
import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_MGBA_RUNTIME_ID,
  KORRI_RETROARCH_PLUGIN_ID,
  retroarchPlugin,
  retroarchReadableLaunchIntegration,
} from "@product/plugins/retroarch"
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

describe("createProseqlLibrarySource", () => {
  it("projects enabled plugin readable records into launch resolution", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            yield* db.library.upsert({
              where: { id: "plugin-game" },
              create: {
                id: "plugin-game",
                releases: [
                  {
                    id: "default",
                    system: "toy",
                    target: { kind: "file", storage: "roms", path: "game.rom" },
                    launch: { use: "@korri:toy-host/echo" },
                  },
                ],
              },
              update: {
                id: "plugin-game",
                releases: [
                  {
                    id: "default",
                    system: "toy",
                    target: { kind: "file", storage: "roms", path: "game.rom" },
                    launch: { use: "@korri:toy-host/echo" },
                  },
                ],
              },
            })
            yield* db.storage.upsert({
              where: { id: "roms" },
              create: { id: "roms", root },
              update: { id: "roms", root },
            })
            const registry = createPluginRegistry(
              [
                plugin({
                  namespace: "@korri",
                  name: "toy-host",
                  contributes: {
                    config: {
                      launchers: {
                        echo: {
                          id: "@korri:toy-host/echo",
                          plugin: "@korri:process",
                          command: "/bin/echo",
                          args: ["{target}"],
                        },
                      },
                      systems: {
                        toy: { id: "toy" },
                      },
                      runtimes: {
                        capabilityOnly: {
                          id: "capabilityOnly",
                          kind: "cpu-translation",
                        },
                      },
                    },
                  },
                }),
              ],
              { enabledPluginIds: ["@korri:toy-host"] },
            )
            const source = createProseqlLibrarySource(
              createLibraryRepository(db, { pluginRegistry: registry }),
            )
            return yield* Effect.promise(() =>
              source.resolveLaunchForGame("plugin-game"),
            )
          }),
        ),
      )

      expect(result.spec).toEqual({
        command: "/bin/echo",
        args: ["game.rom"],
      })
    })
  })

  it("resolves targets stored in plugin-contributed storage by registry id", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            yield* db.library.upsert({
              where: { id: "plugin-storage-game" },
              create: {
                id: "plugin-storage-game",
                releases: [
                  {
                    id: "default",
                    system: "toy",
                    target: {
                      kind: "file",
                      storage: "@korri:toy-host/state",
                      path: "game.rom",
                    },
                    launch: { use: "@korri:toy-host/echo" },
                  },
                ],
              },
              update: {
                id: "plugin-storage-game",
                releases: [
                  {
                    id: "default",
                    system: "toy",
                    target: {
                      kind: "file",
                      storage: "@korri:toy-host/state",
                      path: "game.rom",
                    },
                    launch: { use: "@korri:toy-host/echo" },
                  },
                ],
              },
            })
            const registry = createPluginRegistry(
              [
                plugin({
                  namespace: "@korri",
                  name: "toy-host",
                  contributes: {
                    config: {
                      storage: {
                        state: { id: "state", root },
                      },
                      launchers: {
                        echo: {
                          id: "@korri:toy-host/echo",
                          plugin: "@korri:process",
                          command: "/bin/echo",
                          args: ["{target}"],
                        },
                      },
                      systems: {
                        toy: { id: "toy" },
                      },
                    },
                  },
                }),
              ],
              { enabledPluginIds: ["@korri:toy-host"] },
            )
            const source = createProseqlLibrarySource(
              createLibraryRepository(db, { pluginRegistry: registry }),
            )
            return yield* Effect.promise(() =>
              source.resolveLaunchForGame("plugin-storage-game"),
            )
          }),
        ),
      )

      expect(result.spec).toEqual({
        command: "/bin/echo",
        args: ["game.rom"],
      })
    })
  })

  it("resolves GBA launches through RetroArch plugin-provided mGBA records", async () => {
    await withTempRoot(async root => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            yield* db.storage.upsert({
              where: { id: "roms" },
              create: { id: "roms", root },
              update: { id: "roms", root },
            })
            yield* db.library.upsert({
              where: { id: "super-mario-advance-2" },
              create: {
                id: "super-mario-advance-2",
                releases: [
                  {
                    id: "gba",
                    system: "gba",
                    target: {
                      kind: "file",
                      storage: "roms",
                      path: "gba/Super Mario Advance 2.gba",
                    },
                    launch: {
                      use: KORRI_RETROARCH_APP_ID,
                      runtime: KORRI_RETROARCH_MGBA_RUNTIME_ID,
                    },
                  },
                ],
              },
              update: {
                id: "super-mario-advance-2",
                releases: [
                  {
                    id: "gba",
                    system: "gba",
                    target: {
                      kind: "file",
                      storage: "roms",
                      path: "gba/Super Mario Advance 2.gba",
                    },
                    launch: {
                      use: KORRI_RETROARCH_APP_ID,
                      runtime: KORRI_RETROARCH_MGBA_RUNTIME_ID,
                    },
                  },
                ],
              },
            })
            const registry = createPluginRegistry([retroarchPlugin], {
              enabledPluginIds: [KORRI_RETROARCH_PLUGIN_ID],
            })
            const source = createProseqlLibrarySource(
              createLibraryRepository(db, {
                env: { KORRI_LAUNCH_ARTIFACTS_DIR: join(root, "artifacts") },
                launchIntegrations: [retroarchReadableLaunchIntegration],
                pluginRegistry: registry,
              }),
            )
            return yield* Effect.promise(() =>
              source.resolveLaunchForGame("super-mario-advance-2"),
            )
          }),
        ),
      )

      expect(result.spec.command).toBe("/etc/korri/bin/retroarch")
      expect(result.spec.args).toEqual(
        expect.arrayContaining([
          "-L",
          "/etc/korri/cores/mgba_libretro.so",
          join(root, "gba/Super Mario Advance 2.gba"),
        ]),
      )
    })
  })

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
                launch: { app: "echo" },
                metadata: { name: "F-Zero" },
              },
              launcher: {
                id: "echo",
                command: "/bin/echo",
                args: ["{content.path}"],
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
            yield* repo.upsertApp({
              id: "echo",
              command: "/bin/echo",
              args: ["{target}"],
              systems: ["genesis", "pc"],
            })
            yield* repo.upsertLibraryItem({
              id: "sonic",
              releases: [
                {
                  id: "genesis",
                  system: "genesis",
                  launch: { use: "echo" },
                  target: { kind: "file", storage: "roms", path: "sonic.md" },
                },
                {
                  id: "steam",
                  system: "pc",
                  launch: { use: "echo" },
                  target: {
                    kind: "file",
                    storage: "roms",
                    path: "sonic-steam.bin",
                  },
                },
                { id: "known-only", system: "pc", launch: { use: "echo" } },
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
            const repo = createLibraryRepository(db, {
              env: {
                KORRI_LAUNCH_ARTIFACTS_DIR: join(root, "launch-artifacts"),
              },
              launchIntegrations: [retroarchReadableLaunchIntegration],
            })
            yield* repo.upsertSystem({ id: "gba" })
            yield* repo.upsertRuntime({
              id: "mgba",
              kind: "libretro-core",
              path: "/cores/mgba_libretro.so",
            })
            yield* db.launchers.upsert({
              where: { id: KORRI_RETROARCH_APP_ID },
              create: {
                id: KORRI_RETROARCH_APP_ID,
                plugin: KORRI_RETROARCH_PLUGIN_ID,
                command: "retroarch",
                settings: { plugin: {} },
              },
              update: {
                id: KORRI_RETROARCH_APP_ID,
                plugin: KORRI_RETROARCH_PLUGIN_ID,
                command: "retroarch",
                settings: { plugin: {} },
              },
            })
            yield* repo.upsertGame({
              id: "gba/game",
              system: "gba",
              contentPath: rom,
              launch: { app: KORRI_RETROARCH_APP_ID, module: "mgba" },
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
    })
  })

  it("resolves checked-in expanded RetroArch examples through the library source seam", async () => {
    await withTempRoot(async root => {
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
              createLibraryRepository(db, {
                env: {
                  KORRI_LAUNCH_ARTIFACTS_DIR: join(root, "launch-artifacts"),
                },
                launchIntegrations: [retroarchReadableLaunchIntegration],
              }),
            )
            const canResolve = source.canResolveLaunchForGame
            if (!canResolve) throw new Error("expected canResolveLaunchForGame")
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
                createLibraryRepository(db, {
                  launchIntegrations: [retroarchReadableLaunchIntegration],
                }),
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
