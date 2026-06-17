import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"

import type { LibraryItemRecord } from "../config/records/library-item"
import { LibraryError } from "../library-services"
import { openKorriLibraryDb } from "./library-db"
import { createLibraryRepository } from "./library-repository"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-readable-repository-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const downwell: LibraryItemRecord = {
  id: "downwell",
  title: "Downwell",
  releases: [
    {
      id: "windows",
      system: "windows",
      target: "steam://rungameid/360740",
      apps: [{ id: "steam" }],
    },
  ],
}

const sonic: LibraryItemRecord = {
  id: "sonic-the-hedgehog",
  title: "Sonic the Hedgehog",
  releases: [
    {
      id: "genesis",
      system: "genesis",
      target: { kind: "file", storage: "roms", path: "genesis/Sonic.md" },
      apps: [{ id: "retroarch", runtime: "genesis-plus-gx" }],
    },
    {
      id: "windows-known",
      system: "windows",
      display: { aspect: "unrestricted" },
    },
    {
      id: "steam",
      system: "windows",
      target: "steam://rungameid/71113",
      apps: [{ id: "steam" }],
    },
  ],
}

const marioPackage: LibraryItemRecord = {
  id: "super-mario-advance-2",
  title: "Super Mario Advance 2",
  contains: {
    "super-mario-world": { title: "Super Mario World" },
  },
  releases: [
    {
      id: "gba",
      system: "gba",
      target: {
        kind: "file",
        storage: "roms",
        path: "gba/Super Mario Advance 2.gba",
      },
      apps: [{ id: "retroarch", runtime: "mgba" }],
    },
  ],
}

async function seedReadableLibrary(root: string) {
  return await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
        yield* db.host.upsert({
          where: { id: "local" },
          create: { id: "local", title: "Test Host" },
          update: { id: "local", title: "Test Host" },
        })
        yield* db.storage.upsert({
          where: { id: "roms" },
          create: { id: "roms", root: "/games" },
          update: { id: "roms", root: "/games" },
        })
        yield* db.systems.upsert({
          where: { id: "genesis" },
          create: { id: "genesis", name: "Genesis" },
          update: { id: "genesis", name: "Genesis" },
        })
        yield* db.systems.upsert({
          where: { id: "gba" },
          create: { id: "gba", name: "Game Boy Advance" },
          update: { id: "gba", name: "Game Boy Advance" },
        })
        yield* db.systems.upsert({
          where: { id: "windows" },
          create: { id: "windows", name: "Windows" },
          update: { id: "windows", name: "Windows" },
        })
        yield* db.apps.upsert({
          where: { id: "steam" },
          create: {
            id: "steam",
            kind: "process",
            command: "steam",
            args: ["{target}"],
          },
          update: {
            id: "steam",
            kind: "process",
            command: "steam",
            args: ["{target}"],
          },
        })
        yield* db.apps.upsert({
          where: { id: "retroarch" },
          create: {
            id: "retroarch",
            kind: "retroarch",
            command: "retroarch",
            configFile: { mode: "generated" },
            lifecycle: { saveOnExit: false },
            paths: { systemDirectory: "/bios" },
            video: { fullscreen: true },
          },
          update: {
            id: "retroarch",
            kind: "retroarch",
            command: "retroarch",
            configFile: { mode: "generated" },
            lifecycle: { saveOnExit: false },
            paths: { systemDirectory: "/bios" },
            video: { fullscreen: true },
          },
        })
        for (const runtime of [
          {
            id: "genesis-plus-gx",
            kind: "libretro-core" as const,
            path: "/cores/genesis_plus_gx.so",
          },
          {
            id: "mgba",
            kind: "libretro-core" as const,
            path: "/cores/mgba.so",
          },
        ]) {
          yield* db.runtimes.upsert({
            where: { id: runtime.id },
            create: runtime,
            update: runtime,
          })
        }
        for (const item of [downwell, sonic, marioPackage]) {
          yield* db.library.upsert({
            where: { id: item.id },
            create: item,
            update: item,
          })
        }
        return createLibraryRepository(db, {
          env: { KORRI_LAUNCH_ARTIFACTS_DIR: join(root, "launch-artifacts") },
        })
      }),
    ),
  )
}

function expectLibraryConfigFailure(error: unknown, text: string) {
  expect(error).toBeInstanceOf(LibraryError)
  expect((error as LibraryError).reason).toBe("config")
  expect((error as LibraryError).message).toContain(text)
}

describe("createLibraryRepository — readable playable entries", () => {
  it("lists playable entries derived from library items, contains, and ordered releases", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const entries = await Effect.runPromise(repo.listPlayableEntries())

      expect(entries.map(entry => entry.id)).toEqual([
        "downwell",
        "sonic-the-hedgehog",
        "super-mario-advance-2/super-mario-world",
      ])
      expect(
        entries
          .find(entry => entry.id === "sonic-the-hedgehog")
          ?.releases.map(release => release.id),
      ).toEqual(["genesis", "windows-known", "steam"])
      expect(
        entries
          .find(entry => entry.id === "sonic-the-hedgehog")
          ?.releases.map(release => release.launchable),
      ).toEqual([true, false, true])
    })
  })

  it("lists app choice ids on readable release entries", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      await Effect.runPromise(
        repo.upsertLibraryItem({
          id: "multi-app",
          title: "Multi App",
          releases: [
            {
              id: "genesis",
              system: "genesis",
              target: {
                kind: "file",
                storage: "roms",
                path: "genesis/Multi.md",
              },
              apps: [
                { id: "retroarch", runtime: "genesis-plus-gx" },
                { id: "steam" },
              ],
            },
          ],
        }),
      )

      const entries = await Effect.runPromise(repo.listPlayableEntries())
      expect(
        entries.find(entry => entry.id === "multi-app")?.releases[0]?.apps,
      ).toEqual(["retroarch", "steam"])
    })
  })

  it("launches a selected app choice via appId", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      await Effect.runPromise(
        repo.upsertLibraryItem({
          id: "multi-app",
          title: "Multi App",
          releases: [
            {
              id: "genesis",
              system: "genesis",
              target: {
                kind: "file",
                storage: "roms",
                path: "genesis/Multi.md",
              },
              apps: [
                { id: "retroarch", runtime: "genesis-plus-gx" },
                { id: "steam" },
              ],
            },
          ],
        }),
      )

      const resolved = await Effect.runPromise(
        repo.resolveLaunchForPlayable("multi-app", {
          releaseId: "genesis",
          appId: "steam",
        }),
      )

      expect(resolved.app.id).toBe("steam")
      expect(resolved.release.apps).toEqual(["retroarch", "steam"])
      expect(resolved.spec).toEqual({
        command: "steam",
        args: ["genesis/Multi.md"],
      })
    })
  })

  it("reports app choice ambiguity through repository config errors", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      await Effect.runPromise(
        repo.upsertLibraryItem({
          id: "multi-app",
          title: "Multi App",
          releases: [
            {
              id: "genesis",
              system: "genesis",
              target: {
                kind: "file",
                storage: "roms",
                path: "genesis/Multi.md",
              },
              apps: [{ id: "retroarch" }, { id: "steam" }],
            },
          ],
        }),
      )

      try {
        await Effect.runPromise(
          repo.resolveLaunchForPlayable("multi-app", { releaseId: "genesis" }),
        )
        throw new Error("expected ambiguous app launch to fail")
      } catch (error) {
        expectLibraryConfigFailure(error, "AmbiguousAppChoice")
      }
    })
  })

  it("launches a first-class Steam app through Steam materialization", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      await mkdir(join(root, "steam-home"), { recursive: true })
      await Effect.runPromise(
        repo.upsertRuntime({
          id: "proton-arm64",
          kind: "tool",
          path: "/compat/proton-arm64",
          tool: "proton-arm64",
        }),
      )
      await Effect.runPromise(
        repo.upsertApp({
          id: "steam",
          kind: "steam",
          command: "steam",
          runtime: "proton-arm64",
          state: { root: join(root, "steam-home") },
          extra: { args: ["-silent"] },
          "launch-options": "gamescope -- %command%",
        }),
      )

      await expect(
        Effect.runPromise(repo.canResolveLaunchForPlayable("downwell")),
      ).resolves.toBe(true)

      const resolved = await Effect.runPromise(
        repo.resolveLaunchForPlayable("downwell"),
      )

      expect(resolved.app).toMatchObject({ id: "steam", integration: "steam" })
      expect(resolved.spec).toEqual({
        command: "steam",
        args: ["-applaunch", "360740"],
      })
      expect(resolved.artifacts?.root).toBe(join(root, "steam-home"))
    })
  })

  it("does not report first-class Steam releases launchable with non-rungameid targets", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      await Effect.runPromise(
        repo.upsertApp({
          id: "steam",
          kind: "steam",
          command: "steam",
          state: { root: join(root, "steam-home") },
        }),
      )
      await Effect.runPromise(
        repo.upsertLibraryItem({
          id: "steam-store-shortcut",
          title: "Steam Store Shortcut",
          releases: [
            {
              id: "store-page",
              system: "windows",
              target: "steam://store/2379780",
              apps: [{ id: "steam" }],
            },
          ],
        }),
      )

      await expect(
        Effect.runPromise(
          repo.canResolveLaunchForPlayable("steam-store-shortcut"),
        ),
      ).resolves.toBe(false)
    })
  })

  it("launches a single launchable release without an explicit release id", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const resolved = await Effect.runPromise(
        repo.resolveLaunchForPlayable("downwell"),
      )

      expect(resolved.release.id).toBe("windows")
      expect(resolved.spec).toEqual({
        command: "steam",
        args: ["steam://rungameid/360740"],
      })
    })
  })

  it("requires an explicit release id when multiple releases are launchable", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      try {
        await Effect.runPromise(
          repo.resolveLaunchForPlayable("sonic-the-hedgehog"),
        )
        throw new Error("expected ambiguous launch to fail")
      } catch (error) {
        expectLibraryConfigFailure(error, "AmbiguousRelease")
      }
    })
  })

  it("resolves local launcher Moonlight and sibling Gamescope policy from readable host/app layers", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      await Effect.runPromise(
        repo.upsertApp({
          id: "moonlight",
          command: "moonlight",
          args: ["stream"],
          launch: {
            with: {
              "@korri:gamescope": { extraArgs: ["--expose-wayland"] },
            },
          },
          moonlight: {
            platform: { name: "v4l2m2m" },
            input: { devices: ["/dev/input/event-app"] },
            extraArgs: ["app"],
          },
        }),
      )
      await Effect.runPromise(
        repo.upsertGlobalConfig({
          title: "Test Host",
          moonlight: {
            environment: { FROM_HOST: "1", UNSET_ME: "1" },
            input: { devices: ["/dev/input/event-host"] },
            extraArgs: ["host"],
          },
        }),
      )

      const policy = await Effect.runPromise(
        repo.resolveLocalLauncherPolicy("moonlight", {
          override: { moonlight: { stream: { fps: 30 } } },
        }),
      )

      expect(policy.gamescope.extraArgs).toEqual(["--expose-wayland"])
      expect(policy.moonlight).toEqual({
        environment: { FROM_HOST: "1", UNSET_ME: "1" },
        platform: { name: "v4l2m2m" },
        input: {
          devices: ["/dev/input/event-host", "/dev/input/event-app"],
        },
        stream: { fps: 30 },
        extraArgs: ["host", "app"],
      })
    })
  })

  it("does not report RetroArch releases launchable without a core path", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      await Effect.runPromise(
        repo.upsertLibraryItem({
          id: "coreless",
          title: "Coreless",
          releases: [
            {
              id: "genesis",
              system: "genesis",
              target: {
                kind: "file",
                storage: "roms",
                path: "genesis/Coreless.md",
              },
              apps: [{ id: "retroarch" }],
            },
          ],
        }),
      )

      await expect(
        Effect.runPromise(
          repo.canResolveLaunchForPlayable("coreless", {
            releaseId: "genesis",
          }),
        ),
      ).resolves.toBe(false)
    })
  })

  it("does not report RetroArch releases launchable without content even with expanded policy", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      await Effect.runPromise(
        repo.upsertLibraryItem({
          id: "policy-only",
          title: "Policy Only",
          releases: [
            {
              id: "genesis",
              system: "genesis",
              apps: [{ id: "retroarch", runtime: "genesis-plus-gx" }],
              retroarch: {
                configFile: { mode: "generated" },
                video: { aspectRatio: "full", sync: { frameDelay: 0 } },
                rewind: { enable: true, bufferSizeMb: 20 },
                achievements: { enable: false },
                extraSettings: { notification_show_autoconfig: false },
              },
            },
            {
              id: "steam",
              system: "windows",
              apps: [{ id: "steam" }],
              target: "steam://rungameid/123",
            },
          ],
        }),
      )

      await expect(
        Effect.runPromise(
          repo.canResolveLaunchForPlayable("policy-only", {
            releaseId: "genesis",
          }),
        ),
      ).resolves.toBe(false)
    })
  })

  it("launches the selected release and resolves file-backed content paths", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const resolved = await Effect.runPromise(
        repo.resolveLaunchForPlayable("sonic-the-hedgehog", {
          releaseId: "genesis",
        }),
      )

      expect(resolved.release.id).toBe("genesis")
      expect(resolved.content?.path).toBe("/games/genesis/Sonic.md")
      expect(resolved.app.integration).toBe("retroarch")
      expect(resolved.spec.args).toEqual([
        "-c",
        expect.stringMatching(/retroarch\.cfg$/),
        "-L",
        "/cores/genesis_plus_gx.so",
        "/games/genesis/Sonic.md",
      ])
      const configPath = resolved.spec.args[1]
      const artifactConfigPath = resolved.artifacts?.paths.configPath
      if (configPath === undefined)
        throw new Error("missing generated config arg")
      if (artifactConfigPath === undefined) {
        throw new Error("missing generated config artifact")
      }
      expect(configPath).toBe(artifactConfigPath)
      const config = await readFile(configPath, "utf8")
      expect(config).toContain('config_save_on_exit = "false"')
      expect(config).toContain('video_fullscreen = "true"')
    })
  })

  it("routes kind: ryubing through typed materialization", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const cardRoot = join(root, "switch-card")
      await mkdir(join(cardRoot, ".config/Ryujinx/system"), { recursive: true })
      await mkdir(join(cardRoot, "roms/switch"), { recursive: true })
      await writeFile(
        join(cardRoot, ".config/Ryujinx/system/prod.keys"),
        "keys",
      )
      await writeFile(
        join(cardRoot, "roms/switch/Mario Kart 8 Deluxe.nsp"),
        "game",
      )

      await Effect.runPromise(
        repo.upsertStorage({ id: "switch-card", root: cardRoot }),
      )
      await Effect.runPromise(
        repo.upsertSystem({ id: "switch", name: "Switch" }),
      )
      await Effect.runPromise(
        repo.upsertApp({
          id: "ryubing",
          kind: "ryubing",
          command: "/bin/Ryujinx",
          state: {
            root: "{storage:switch-card}/.config/Ryujinx",
            create: true,
            require: { keys: ["prod.keys"] },
          },
          input: { "require-config": true, controllers: [{ id: "0" }] },
        }),
      )
      await Effect.runPromise(
        repo.upsertLibraryItem({
          id: "mario-kart-8-deluxe",
          releases: [
            {
              id: "switch",
              system: "switch",
              apps: [{ id: "ryubing" }],
              target: {
                kind: "file",
                storage: "switch-card",
                path: "roms/switch/Mario Kart 8 Deluxe.nsp",
              },
            },
          ],
        }),
      )

      const resolved = await Effect.runPromise(
        repo.resolveLaunchForPlayable("mario-kart-8-deluxe"),
      )

      expect(resolved.app.integration).toBe("ryubing")
      expect(resolved.artifacts).toBeUndefined()
      expect(resolved.spec.command).toBe("/bin/Ryujinx")
      expect(resolved.spec.args).toEqual([
        "--no-gui",
        "--root-data-dir",
        join(cardRoot, ".config/Ryujinx"),
        "--use-main-config",
        join(cardRoot, "roms/switch/Mario Kart 8 Deluxe.nsp"),
      ])
      const config = JSON.parse(
        await readFile(join(cardRoot, ".config/Ryujinx/Config.json"), "utf8"),
      )
      expect(config.input_config).toHaveLength(1)
    })
  })

  it("does not report Ryubing releases launchable without state.root", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const cardRoot = join(root, "switch-card")
      await mkdir(join(cardRoot, "roms/switch"), { recursive: true })
      await writeFile(
        join(cardRoot, "roms/switch/Mario Kart 8 Deluxe.nsp"),
        "game",
      )

      await Effect.runPromise(
        repo.upsertStorage({ id: "switch-card", root: cardRoot }),
      )
      await Effect.runPromise(
        repo.upsertSystem({ id: "switch", name: "Switch" }),
      )
      await Effect.runPromise(
        repo.upsertApp({
          id: "ryubing",
          kind: "ryubing",
          command: "/bin/Ryujinx",
          input: { "require-config": true, controllers: [{ id: "0" }] },
        }),
      )
      await Effect.runPromise(
        repo.upsertLibraryItem({
          id: "mario-kart-8-deluxe",
          releases: [
            {
              id: "switch",
              system: "switch",
              apps: [{ id: "ryubing" }],
              target: {
                kind: "file",
                storage: "switch-card",
                path: "roms/switch/Mario Kart 8 Deluxe.nsp",
              },
            },
          ],
        }),
      )

      await expect(
        Effect.runPromise(
          repo.canResolveLaunchForPlayable("mario-kart-8-deluxe"),
        ),
      ).resolves.toBe(false)
    })
  })

  it("applies package releases to contained playable ids", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const resolved = await Effect.runPromise(
        repo.resolveLaunchForPlayable(
          "super-mario-advance-2/super-mario-world",
        ),
      )

      expect(resolved.playable.id).toBe(
        "super-mario-advance-2/super-mario-world",
      )
      expect(resolved.release.id).toBe("gba")
      expect(resolved.content?.path).toBe(
        "/games/gba/Super Mario Advance 2.gba",
      )
    })
  })

  it("keeps known-only releases visible but rejects launching them", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const entries = await Effect.runPromise(repo.listPlayableEntries())
      expect(
        entries
          .find(entry => entry.id === "sonic-the-hedgehog")
          ?.releases.find(release => release.id === "windows-known")
          ?.launchable,
      ).toBe(false)

      try {
        await Effect.runPromise(
          repo.resolveLaunchForPlayable("sonic-the-hedgehog", {
            releaseId: "windows-known",
          }),
        )
        throw new Error("expected known-only launch to fail")
      } catch (error) {
        expectLibraryConfigFailure(error, "ReleaseNotLaunchable")
      }
    })
  })

  it("reports launch selection errors as graceful LibraryError at the public seam", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const source = repo.asLibrarySource()
      try {
        await source.resolveLaunchForGame("sonic-the-hedgehog")
        throw new Error("expected launch to fail")
      } catch (error) {
        expectLibraryConfigFailure(error, "AmbiguousRelease")
      }
    })
  })
})
