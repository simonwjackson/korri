import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import { Effect } from "effect"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "../../gamescope"
import {
  materializeReadableSteamLaunch,
  steamReadableLaunchIntegration,
} from "./materializer"
import {
  KORRI_STEAM_APP_ID,
  KORRI_STEAM_PLUGIN_ID,
  KORRI_STEAM_STORAGE_ID,
} from "./plugin"
import {
  parseVdf,
  type SteamLifecycle,
  type SteamStateFileSystem,
  type SteamStateLock,
} from "./state-materializer"

const inlineLock: SteamStateLock = {
  withLock: async (_key, run) => run(),
}

const memoryFs = () => {
  const files = new Map<string, string>()
  const writes: string[] = []
  const fs: SteamStateFileSystem = {
    readText: async path => files.get(path),
    writeTextAtomic: async (path, content) => {
      writes.push(path)
      files.set(path, content)
    },
    mkdirp: async () => {},
  }
  return { fs, files, writes }
}

const errorReason = (error: unknown): string =>
  typeof error === "object" && error !== null && "reason" in error
    ? String(error.reason)
    : ""

const lifecycle = (events: string[]): SteamLifecycle => ({
  shutdown: async input => {
    events.push(`shutdown:${input.command}`)
  },
  waitForShutdown: async () => {
    events.push("wait-shutdown")
  },
  start: async input => {
    events.push(`start:${input.args.join(" ")}`)
  },
  waitUntilReady: async () => {
    events.push("ready")
  },
})

async function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-steam-materializer-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const context = (root: string): ReadableResolvedLaunchContext => ({
  playableId: "thirty-xx",
  itemId: "thirty-xx",
  releaseId: "steam",
  system: "windows",
  target: "steam://rungameid/1029210",
  app: {
    id: KORRI_STEAM_APP_ID,
    plugin: KORRI_STEAM_PLUGIN_ID,
    command: "steam",
  },
  runtime: {
    id: "proton-arm64",
    kind: "tool" as const,
    path: "/compat/proton-arm64",
    tool: "proton-arm64",
  },
  plugin: {
    [KORRI_STEAM_PLUGIN_ID]: {
      state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}` },
      extra: { args: ["-silent", "-gamepadui"] },
      "launch-options": "wrapper -- %command%",
    },
  },
  storage: {
    [KORRI_STEAM_STORAGE_ID]: {
      id: KORRI_STEAM_STORAGE_ID,
      root,
    },
  },
  launchCompanions: { [KORRI_GAMESCOPE_PLUGIN_ID]: { enable: true } },
})

describe("steamReadableLaunchIntegration", () => {
  it("matches provider-qualified Steam contexts with an AppID target and plugin policy", async () => {
    await withRoot(async root => {
      expect(steamReadableLaunchIntegration).toMatchObject({
        providerId: KORRI_STEAM_PLUGIN_ID,
        kind: KORRI_STEAM_PLUGIN_ID,
        integration: "steam",
      })
      expect(steamReadableLaunchIntegration.canResolve(context(root))).toBe(
        true,
      )
      expect(
        steamReadableLaunchIntegration.canResolve({
          ...context(root),
          target: "steam://store/1029210",
        }),
      ).toBe(false)
      expect(
        steamReadableLaunchIntegration.canResolve({
          ...context(root),
          launchCompanions: {},
        }),
      ).toBe(true)
    })
  })

  it("materializes desired Steam state and returns the managed korri-steam-app wrapper", async () => {
    await withRoot(async root => {
      await mkdir(root, { recursive: true })
      const events: string[] = []
      const { fs, files, writes } = memoryFs()

      const result = await Effect.runPromise(
        materializeReadableSteamLaunch({
          context: context(root),
          fs,
          lifecycle: lifecycle(events),
          lock: inlineLock,
        }),
      )

      expect(result.spec).toEqual({
        command: "korri-steam-app",
        args: ["1029210"],
      })
      expect(result.launchMetadata).toEqual({
        appProviderId: KORRI_STEAM_PLUGIN_ID,
        annotations: {
          [KORRI_STEAM_PLUGIN_ID]: {
            steamSession: true,
            foregroundCleanup: { appId: "1029210" },
          },
        },
      })
      expect(result.artifacts).toBeUndefined()
      expect(events).toEqual([
        "shutdown:steam",
        "wait-shutdown",
        "start:-silent -gamepadui",
        "ready",
      ])
      expect(writes.length).toBe(2)
      const config = parseVdf(
        files.get(join(root, "config", "config.vdf")) ?? "",
      )
      expect(config).toMatchObject({
        InstallConfigStore: {
          Software: {
            Valve: {
              Steam: {
                CompatToolMapping: {
                  "0": {
                    name: "proton-cachyos-11.0-20260601-slr-arm64",
                    config: "",
                    priority: "250",
                  },
                },
              },
            },
          },
        },
      })
      const localconfig = parseVdf(
        files.get(join(root, "userdata", "0", "config", "localconfig.vdf")) ??
          "",
      )
      expect(localconfig).toMatchObject({
        UserLocalConfigStore: {
          Software: {
            Valve: {
              Steam: {
                Deck_ConfiguratorInterstitialsVersionSeen_Intro: "99",
                apps: {
                  "1029210": {
                    LaunchOptions: "wrapper -- %command%",
                    "1029210_eula_0": "1",
                  },
                },
              },
            },
          },
        },
      })
    })
  })

  it("renders korri-steam-app wrapper launches with AppID-only args", async () => {
    await withRoot(async root => {
      await mkdir(root, { recursive: true })
      const events: string[] = []
      const { fs } = memoryFs()
      const command = "/run/current-system/sw/bin/korri-steam-app"

      const result = await Effect.runPromise(
        materializeReadableSteamLaunch({
          context: {
            ...context(root),
            app: {
              ...context(root).app,
              command,
            },
            launchCompanions: {},
          },
          fs,
          lifecycle: lifecycle(events),
          lock: inlineLock,
        }),
      )

      expect(result.spec).toEqual({ command, args: ["1029210"] })
      expect(result.launchMetadata).toMatchObject({
        annotations: {
          [KORRI_STEAM_PLUGIN_ID]: {
            foregroundCleanup: { appId: "1029210" },
          },
        },
      })
      expect(events).toEqual([
        `shutdown:${command}`,
        "wait-shutdown",
        "start:-silent -gamepadui",
        "ready",
      ])
    })
  })

  it("does not require an external Gamescope companion because korri-steam-app owns the gamescoped gate", async () => {
    await withRoot(async root => {
      await mkdir(root, { recursive: true })
      const { fs } = memoryFs()

      const result = await Effect.runPromise(
        materializeReadableSteamLaunch({
          context: { ...context(root), launchCompanions: {} },
          fs,
          lifecycle: lifecycle([]),
          lock: inlineLock,
        }),
      )

      expect(result.spec).toEqual({
        command: "korri-steam-app",
        args: ["1029210"],
      })
    })
  })

  it("maps invalid Steam targets to a plugin-owned materialization failure", async () => {
    await withRoot(async root => {
      await mkdir(root, { recursive: true })
      const error = await Effect.runPromise(
        Effect.flip(
          materializeReadableSteamLaunch({
            context: { ...context(root), target: "steam://store/1029210" },
            fs: memoryFs().fs,
            lifecycle: lifecycle([]),
            lock: inlineLock,
          }),
        ),
      )

      expect(error).toMatchObject({
        _tag: "AppMaterializationFailed",
        appId: KORRI_STEAM_APP_ID,
      })
      expect(errorReason(error)).toContain("InvalidSteamTarget")
    })
  })

  it("decodes the locked compat-tool and first-launch policy keys", async () => {
    await withRoot(async root => {
      await mkdir(root, { recursive: true })
      const { fs, files } = memoryFs()

      await Effect.runPromise(
        materializeReadableSteamLaunch({
          context: {
            ...context(root),
            plugin: {
              [KORRI_STEAM_PLUGIN_ID]: {
                state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}` },
                "compat-tool": "global-tool",
                "compat-tool-overrides": { "1029210": "game-tool" },
                "first-launch": {
                  "suppress-interstitials": false,
                  "accept-eulas": false,
                },
              },
            },
          },
          fs,
          lifecycle: lifecycle([]),
          lock: inlineLock,
        }),
      )

      expect(
        parseVdf(files.get(join(root, "config", "config.vdf")) ?? ""),
      ).toMatchObject({
        InstallConfigStore: {
          Software: {
            Valve: {
              Steam: {
                CompatToolMapping: {
                  "0": { name: "global-tool", config: "", priority: "250" },
                  "1029210": {
                    name: "game-tool",
                    config: "",
                    priority: "250",
                  },
                },
              },
            },
          },
        },
      })
      expect(
        files.has(join(root, "userdata", "0", "config", "localconfig.vdf")),
      ).toBe(false)
    })
  })

  it("rejects malformed locked policy keys before writing state", async () => {
    await withRoot(async root => {
      await mkdir(root, { recursive: true })
      const { fs, writes } = memoryFs()

      const error = await Effect.runPromise(
        Effect.flip(
          materializeReadableSteamLaunch({
            context: {
              ...context(root),
              plugin: {
                [KORRI_STEAM_PLUGIN_ID]: {
                  state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}` },
                  "compat-tool-overrides": { "400": 123 },
                },
              },
            },
            fs,
            lifecycle: lifecycle([]),
            lock: inlineLock,
          }),
        ),
      )

      expect(errorReason(error)).toContain(
        "compat-tool-overrides values must be non-empty strings",
      )
      expect(writes).toEqual([])
    })
  })

  it("rejects Korri placeholders in LaunchOptions before writing state", async () => {
    await withRoot(async root => {
      await mkdir(root, { recursive: true })
      const { fs, writes } = memoryFs()
      const steamContext = context(root)
      const error = await Effect.runPromise(
        Effect.flip(
          materializeReadableSteamLaunch({
            context: {
              ...steamContext,
              plugin: {
                [KORRI_STEAM_PLUGIN_ID]: {
                  state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}` },
                  "launch-options": "wrapper -- {content.path}",
                },
              },
            },
            fs,
            lifecycle: lifecycle([]),
            lock: inlineLock,
          }),
        ),
      )

      expect(errorReason(error)).toContain("InvalidSteamLaunchOptions")
      expect(writes).toEqual([])
    })
  })

  it("fails missing storage tokens before writing desired state", async () => {
    const { fs, writes } = memoryFs()
    const error = await Effect.runPromise(
      Effect.flip(
        materializeReadableSteamLaunch({
          context: { ...context("/missing"), storage: {} },
          fs,
          lifecycle: lifecycle([]),
          lock: inlineLock,
        }),
      ),
    )

    expect(errorReason(error)).toContain(
      `storage ${KORRI_STEAM_STORAGE_ID} is not configured`,
    )
    expect(writes).toEqual([])
  })
})
