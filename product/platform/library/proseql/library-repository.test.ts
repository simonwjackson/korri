import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "@product/plugins/gamescope"
import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_PLUGIN_ID,
  retroarchReadableLaunchIntegration,
} from "@product/plugins/retroarch"
import {
  KORRI_STEAM_APP_ID,
  KORRI_STEAM_PLUGIN_ID,
  KORRI_STEAM_STORAGE_ID,
  steamReadableLaunchIntegration,
} from "@product/plugins/steam"
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
      apps: [{ id: KORRI_RETROARCH_APP_ID, runtime: "genesis-plus-gx" }],
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
      apps: [{ id: KORRI_RETROARCH_APP_ID, runtime: "mgba" }],
    },
  ],
}

async function seedReadableLibrary(
  root: string,
  options: {
    readonly launchIntegrations?: boolean
    readonly steamLaunchIntegration?: boolean
  } = {},
) {
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
          where: { id: KORRI_RETROARCH_APP_ID },
          create: {
            id: KORRI_RETROARCH_APP_ID,
            kind: KORRI_RETROARCH_PLUGIN_ID,
            command: "retroarch",
            plugin: {
              [KORRI_RETROARCH_PLUGIN_ID]: {
                configFile: { mode: "generated" },
                lifecycle: { saveOnExit: false },
                paths: { systemDirectory: "/bios" },
                video: { fullscreen: true },
              },
            },
          },
          update: {
            id: KORRI_RETROARCH_APP_ID,
            kind: KORRI_RETROARCH_PLUGIN_ID,
            command: "retroarch",
            plugin: {
              [KORRI_RETROARCH_PLUGIN_ID]: {
                configFile: { mode: "generated" },
                lifecycle: { saveOnExit: false },
                paths: { systemDirectory: "/bios" },
                video: { fullscreen: true },
              },
            },
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
          launchIntegrations:
            options.launchIntegrations === false
              ? []
              : [
                  retroarchReadableLaunchIntegration,
                  ...(options.steamLaunchIntegration
                    ? [steamReadableLaunchIntegration]
                    : []),
                ],
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
                { id: KORRI_RETROARCH_APP_ID, runtime: "genesis-plus-gx" },
                { id: "steam" },
              ],
            },
          ],
        }),
      )

      const entries = await Effect.runPromise(repo.listPlayableEntries())
      expect(
        entries.find(entry => entry.id === "multi-app")?.releases[0]?.apps,
      ).toEqual([KORRI_RETROARCH_APP_ID, "steam"])
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
                { id: KORRI_RETROARCH_APP_ID, runtime: "genesis-plus-gx" },
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
      expect(resolved.release.apps).toEqual([KORRI_RETROARCH_APP_ID, "steam"])
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
              apps: [{ id: KORRI_RETROARCH_APP_ID }, { id: "steam" }],
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

  it("resolves provider-qualified Steam AppID launches through the registered integration", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root, {
        steamLaunchIntegration: true,
      })
      const steamStorageRoot = join(root, "steam-storage")
      await mkdir(steamStorageRoot, { recursive: true })
      await Effect.runPromise(
        repo.upsertStorage({
          id: KORRI_STEAM_STORAGE_ID,
          root: steamStorageRoot,
        }),
      )
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
          id: KORRI_STEAM_APP_ID,
          kind: KORRI_STEAM_PLUGIN_ID,
          command: "steam",
          runtime: "proton-arm64",
          launch: { with: { [KORRI_GAMESCOPE_PLUGIN_ID]: { enable: true } } },
          plugin: {
            [KORRI_STEAM_PLUGIN_ID]: {
              state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}/Steam` },
              extra: { args: ["-silent"] },
              "launch-options": "wrapper -- %command%",
            },
          },
        }),
      )
      await Effect.runPromise(
        repo.upsertLibraryItem({
          id: "thirty-xx",
          title: "30XX",
          releases: [
            {
              id: "steam",
              system: "windows",
              target: "steam://rungameid/1029210",
              apps: [{ id: KORRI_STEAM_APP_ID, runtime: "proton-arm64" }],
            },
          ],
        }),
      )

      await expect(
        Effect.runPromise(repo.canResolveLaunchForPlayable("thirty-xx")),
      ).resolves.toBe(true)
      const resolved = await Effect.runPromise(
        repo.resolveLaunchForPlayable("thirty-xx"),
      )

      expect(resolved.app).toEqual({
        id: KORRI_STEAM_APP_ID,
        integration: "steam",
      })
      expect(resolved.spec).toEqual({
        command: "steam",
        args: ["-applaunch", "1029210"],
      })
      expect(resolved.launchMetadata).toEqual({
        appProviderId: KORRI_STEAM_PLUGIN_ID,
        annotations: { [KORRI_STEAM_PLUGIN_ID]: { steamSession: true } },
      })
      expect(resolved.artifacts?.root).toBe(join(steamStorageRoot, "Steam"))
    })
  })

  it("fails closed for provider-qualified Steam apps without a registered integration", async () => {
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
          id: KORRI_STEAM_APP_ID,
          kind: KORRI_STEAM_PLUGIN_ID,
          command: "steam",
          runtime: "proton-arm64",
          plugin: {
            [KORRI_STEAM_PLUGIN_ID]: {
              state: { root: join(root, "steam-home") },
              extra: { args: ["-silent"] },
              "launch-options": "wrapper -- %command%",
            },
          },
        }),
      )
      await Effect.runPromise(
        repo.upsertLibraryItem({
          id: "thirty-xx-disabled",
          title: "30XX Disabled",
          releases: [
            {
              id: "steam",
              system: "windows",
              target: "steam://rungameid/1029210",
              apps: [{ id: KORRI_STEAM_APP_ID, runtime: "proton-arm64" }],
            },
          ],
        }),
      )

      await expect(
        Effect.runPromise(
          repo.canResolveLaunchForPlayable("thirty-xx-disabled"),
        ),
      ).resolves.toBe(false)
      await expect(
        Effect.runPromise(repo.resolveLaunchForPlayable("thirty-xx-disabled")),
      ).rejects.toMatchObject({ _tag: "LibraryError", reason: "config" })
    })
  })

  it("does not report provider-qualified Steam releases launchable without an integration", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      await Effect.runPromise(
        repo.upsertApp({
          id: KORRI_STEAM_APP_ID,
          kind: KORRI_STEAM_PLUGIN_ID,
          command: "steam",
          plugin: {
            [KORRI_STEAM_PLUGIN_ID]: {
              state: { root: join(root, "steam-home") },
            },
          },
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
              apps: [{ id: KORRI_STEAM_APP_ID }],
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

  it("preserves launch companions through legacy launcher upsert", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      await Effect.runPromise(
        repo.upsertLauncher({
          id: "moonlight",
          command: "moonlight",
          args: ["stream"],
          systems: [],
          launch: {
            with: {
              "@example:wrapper": { extraArgs: ["--expose-wayland"] },
            },
          },
        }),
      )

      const policy = await Effect.runPromise(
        repo.resolveLocalLauncherPolicy("moonlight"),
      )

      expect(
        (
          policy.launchCompanions["@example:wrapper"] as
            | { readonly extraArgs?: readonly string[] }
            | undefined
        )?.extraArgs,
      ).toEqual(["--expose-wayland"])
    })
  })

  it("resolves local launcher Moonlight and sibling launch companion policy from readable host/app layers", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      await Effect.runPromise(
        repo.upsertApp({
          id: "moonlight",
          command: "moonlight",
          args: ["stream"],
          launch: {
            with: {
              "@example:wrapper": { extraArgs: ["--expose-wayland"] },
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

      expect(
        (
          policy.launchCompanions["@example:wrapper"] as
            | { readonly extraArgs?: readonly string[] }
            | undefined
        )?.extraArgs,
      ).toEqual(["--expose-wayland"])
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
              apps: [{ id: KORRI_RETROARCH_APP_ID }],
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

  it("does not report RetroArch releases launchable with non-libretro runtimes", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      await Effect.runPromise(
        repo.upsertRuntime({
          id: "genesis-plus-gx",
          kind: "tool",
          path: "/tools/not-a-core",
        }),
      )

      await expect(
        Effect.runPromise(
          repo.canResolveLaunchForPlayable("sonic-the-hedgehog", {
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
              apps: [
                { id: KORRI_RETROARCH_APP_ID, runtime: "genesis-plus-gx" },
              ],
              plugin: {
                [KORRI_RETROARCH_PLUGIN_ID]: {
                  configFile: { mode: "generated" },
                  video: { aspectRatio: "full", sync: { frameDelay: 0 } },
                  rewind: { enable: true, bufferSizeMb: 20 },
                  achievements: { enable: false },
                  extraSettings: { notification_show_autoconfig: false },
                },
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

  it("fails closed for provider-qualified app kinds without a registered integration", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root, {
        launchIntegrations: false,
      })

      await expect(
        Effect.runPromise(
          repo.canResolveLaunchForPlayable("sonic-the-hedgehog", {
            releaseId: "genesis",
          }),
        ),
      ).resolves.toBe(false)

      await expect(
        Effect.runPromise(
          repo.resolveLaunchForPlayable("sonic-the-hedgehog", {
            releaseId: "genesis",
          }),
        ),
      ).rejects.toThrow("no launch integration registered")
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
