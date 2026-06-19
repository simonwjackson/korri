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
import type {
  SteamLifecycle,
  SteamStateFileSystem,
  SteamStateLock,
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
      state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}/Steam` },
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
    })
  })

  it("materializes desired Steam state and returns steam -applaunch", async () => {
    await withRoot(async root => {
      await mkdir(root, { recursive: true })
      const events: string[] = []
      const { fs, writes } = memoryFs()

      const result = await Effect.runPromise(
        materializeReadableSteamLaunch({
          context: context(root),
          fs,
          lifecycle: lifecycle(events),
          lock: inlineLock,
        }),
      )

      expect(result.spec).toEqual({
        command: "steam",
        args: ["-applaunch", "1029210"],
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
      expect(result.artifacts?.root).toBe(join(root, "Steam"))
      expect(Object.values(result.artifacts?.paths ?? {})).toEqual([
        join(root, "Steam", "userdata", "0", "config", "localconfig.vdf"),
        join(root, "Steam", "config", "config.vdf"),
      ])
      expect(events).toEqual([
        "shutdown:steam",
        "wait-shutdown",
        "start:-silent -gamepadui",
        "ready",
      ])
      expect(writes.length).toBe(2)
    })
  })

  it("fails closed when the Gamescope launch companion is unavailable", async () => {
    await withRoot(async root => {
      await mkdir(root, { recursive: true })
      const error = await Effect.runPromise(
        Effect.flip(
          materializeReadableSteamLaunch({
            context: { ...context(root), launchCompanions: {} },
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
      expect(errorReason(error)).toContain("@korri:gamescope")
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
                  state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}/Steam` },
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
