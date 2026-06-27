import { describe, expect, it } from "bun:test"
import { Effect } from "effect"

import {
  foldPluginPolicies,
  type ReadableConfigSnapshot,
  resolveReadableLaunchContext,
} from "./cascade-resolver"
import type { AppRecord } from "./records/app"
import type { HostRecord } from "./records/host"
import type { LibraryItemRecord } from "./records/library-item"
import type { ProfileRecord } from "./records/profile"
import type { RuntimeRecord } from "./records/runtime"
import type { SourceRecord } from "./records/source"
import type { StorageRecord } from "./records/storage"
import type { SystemRecord } from "./records/system"
import type { UserRecord } from "./records/user"

const wrapperProvider = "@example:wrapper"
const retroarchProvider = "@korri:retroarch"
const steamProvider = "@korri:steam"
const steamAppId = "@korri:steam/steam"
const retiredWrapperKey = ["game", "scope"].join("")
type WrapperPolicy = {
  readonly enable?: boolean
  readonly environment?: Readonly<Record<string, string | null>>
  readonly app?: {
    readonly environment?: Readonly<Record<string, string | null>>
  }
  readonly display?: unknown
  readonly backend?: unknown
  readonly scaling?: { readonly filter?: string }
  readonly stats?: unknown
  readonly extraArgs?: readonly string[]
  readonly steam?: unknown
}

const wrapperLaunch = (policy: WrapperPolicy) => ({
  launch: { with: { [wrapperProvider]: policy } },
})

const wrapperPolicyFrom = (context: {
  readonly launchCompanions?: Readonly<Record<string, unknown>>
}): WrapperPolicy | undefined =>
  context.launchCompanions?.[wrapperProvider] as WrapperPolicy | undefined

const launchCompanionPoliciesFrom = (context: {
  readonly launchCompanions?: Readonly<Record<string, unknown>>
}): readonly WrapperPolicy[] =>
  Object.values(context.launchCompanions ?? {}) as readonly WrapperPolicy[]

const host: HostRecord = {
  id: "local",
  ...wrapperLaunch({
    enable: true,
    extraArgs: ["host"],
    environment: { OUTER_ONLY: "host", OUTER_UNSET: "1" },
    display: { output: { width: 640 } },
  }),
  moonlight: {
    environment: { ML_KEEP: "host", ML_UNSET: "1" },
    input: { devices: ["/dev/input/event-host"] },
    stream: { resolution: { width: 1280 } },
    extraArgs: ["host"],
  },
  plugin: {
    [retroarchProvider]: {
      environment: { RA_KEEP: "host", RA_UNSET: "1" },
      configFile: { append: ["/tmp/host.cfg"] },
      logging: { verbosity: false, fpsShow: false },
      drivers: { video: "glcore", menu: "rgui" },
      paths: { cacheDirectory: "/host/cache" },
      video: { fullscreen: true, sync: { hardSync: true, frameDelay: 0 } },
      audio: { mute: false, outputRate: 48000 },
      input: {
        ports: { "1": { libretroDevice: 1, joypadIndex: 0 } },
      },
      menu: { showStartScreen: false, pauseLibretro: true },
      saves: { autosaveIntervalSeconds: 60, autoLoadState: true },
      rewind: { enable: true, bufferSizeMb: 20 },
      playback: { pauseNonactive: true, slowmotionRatio: 3 },
      latency: {
        runAhead: { enable: true, frames: 1 },
        preemptiveFrames: { enable: false },
      },
      achievements: { enable: true, username: "host-user", badges: false },
      haptics: { vibrateOnKeypress: false },
      playlists: { useOldFormat: true },
      privacy: { cameraAllow: false, locationAllow: false },
      updater: { showOnlineUpdater: false, buildbotUrl: null },
      extraArgs: ["host"],
    },
  },
}
const user: UserRecord = {
  id: "simon",
  ...wrapperLaunch({
    extraArgs: ["user"],
    app: { environment: { WAYLAND_DISPLAY: "wayland-1" } },
    display: { output: { height: 480 } },
  }),
  moonlight: {
    input: { devices: ["/dev/input/event-user"] },
    stream: { resolution: { height: 720 } },
    extraArgs: ["user"],
  },
  plugin: {
    [retroarchProvider]: {
      configFile: { append: ["/tmp/user.cfg"] },
      logging: { fpsShow: true },
      drivers: { menu: "ozone" },
      paths: { thumbnailsDirectory: "/user/thumbnails" },
      video: { sync: { frameDelay: 99, frameDelayAuto: true } },
      input: {
        ports: {
          "1": { joypadIndex: 2, analogDpadMode: 1 },
          "2": { libretroDevice: 257, joypadIndex: 1 },
        },
      },
      menu: { pointerEnable: true },
      saves: { autoSaveState: true },
      rewind: { bufferSizeMb: 24, granularity: 2 },
      playback: { fastforwardRatio: 0 },
      latency: {
        runAhead: { frames: 2 },
        preemptiveFrames: { enable: true, frames: 3 },
      },
      achievements: { username: "user-name", hardcoreMode: true },
      haptics: { deviceVibration: true },
      playlists: { useOldFormat: false },
      privacy: { cameraDevice: "/dev/video0" },
      updater: {
        showCoreUpdater: false,
        buildbotAssetsUrl: "https://updates.example.invalid/assets",
      },
    },
  },
}
const system: SystemRecord = {
  id: "genesis",
}
const source: SourceRecord = {
  id: "roms",
  kind: ["files"],
  storage: "roms",
  ...wrapperLaunch({
    extraArgs: ["source"],
    display: { nested: { height: 240 } },
  }),
  moonlight: { extraArgs: ["source"], platform: { name: "v4l2m2m" } },
  plugin: {
    [retroarchProvider]: {
      paths: { systemDirectory: "/bios", cacheDirectory: "/source/cache" },
      extraArgs: ["source"],
    },
  },
}
const app: AppRecord = {
  id: "@korri:retroarch/retroarch",
  plugin: retroarchProvider,
  command: "retroarch",
  args: ["-L", "{runtime.path}", "{content.path}"],
  systems: ["genesis"],
  ...wrapperLaunch({ extraArgs: ["app"], backend: { allowDeferred: true } }),
  moonlight: {
    extraArgs: ["app"],
    logging: { verbose: true },
    platform: { name: "v4l2m2m" },
  },
  settings: {
    plugin: {
      paths: { systemDirectory: "/bios", cacheDirectory: "/source/cache" },
      lifecycle: { saveOnExit: false },
      extraArgs: ["app"],
    },
  },
}
const runtime: RuntimeRecord = {
  id: "genesis-plus-gx",
  kind: "libretro-core",
  path: "/cores/genesis_plus_gx.so",
  ...wrapperLaunch({ extraArgs: ["runtime"], scaling: { filter: "fsr" } }),
  moonlight: { extraArgs: ["runtime"], stream: { fps: 60 } },
  plugin: {
    [retroarchProvider]: {
      core: { path: "/cores/runtime-override.so" },
      extraArgs: ["runtime"],
    },
  },
}
const profile: ProfileRecord = {
  id: "handheld",
  ...wrapperLaunch({
    extraArgs: ["profile"],
    app: { environment: { WAYLAND_DISPLAY: null } },
  }),
  moonlight: {
    environment: { ML_UNSET: null },
    extraArgs: ["profile"],
    window: { autoResize: false },
  },
  plugin: {
    [retroarchProvider]: {
      environment: { RA_UNSET: null },
      video: { fullscreen: false, sync: { hardSyncFrames: 1 } },
      audio: { mute: true },
      extraSettings: { video_font_enable: false },
      extraArgs: ["profile"],
    },
  },
  env: { SCALE: "profile" },
}
const storage: StorageRecord = { id: "roms", root: "/games" }
const sonic: LibraryItemRecord = {
  id: "sonic-the-hedgehog",
  ...wrapperLaunch({ extraArgs: ["item"] }),
  moonlight: { extraArgs: ["item"] },
  releases: [
    {
      id: "genesis",
      system: "genesis",
      target: { kind: "file", storage: "roms", path: "genesis/Sonic.md" },
      launch: {
        use: "@korri:retroarch/retroarch",
        runtime: "genesis-plus-gx",
        with: { [wrapperProvider]: { extraArgs: ["release"] } },
        settings: {
          plugin: {
            extraSettings: { video_font_enable: true },
            extraArgs: ["release"],
          },
        },
      },
      moonlight: { extraArgs: ["release"] },
    },
  ],
}
const sonicMulti: LibraryItemRecord = {
  id: "sonic-the-hedgehog",
  releases: [
    {
      id: "genesis",
      system: "genesis",
      target: { kind: "file", storage: "roms", path: "genesis/Sonic.md" },
      launch: { use: "@korri:retroarch/retroarch", runtime: "genesis-plus-gx" },
    },
    {
      id: "steam",
      system: "windows",
      target: { kind: "url", value: "steam://rungameid/71113" },
      launch: { use: steamAppId },
    },
  ],
}
const gbaPackage: LibraryItemRecord = {
  id: "super-mario-advance-2",
  contains: {
    "super-mario-world": {
      title: "Super Mario World",
      ...wrapperLaunch({ extraArgs: ["contained"] }),
    },
  },
  releases: [
    {
      id: "gba",
      system: "genesis",
      target: { kind: "file", storage: "roms", path: "gba/sma2.gba" },
      launch: { use: "@korri:retroarch/retroarch", runtime: "genesis-plus-gx" },
    },
  ],
}

const snapshot = (item: LibraryItemRecord = sonic): ReadableConfigSnapshot => ({
  host,
  users: new Map([["simon", user]]),
  systems: new Map([["genesis", system]]),
  sources: new Map([["roms", source]]),
  readableLaunchers: new Map([["@korri:retroarch/retroarch", app]]),
  runtimes: new Map([["genesis-plus-gx", runtime]]),
  profiles: new Map([["handheld", profile]]),
  storage: new Map([["roms", storage]]),
  library: new Map([[item.id, item]]),
})

const steamApp = (overrides: Partial<AppRecord> = {}): AppRecord => ({
  id: steamAppId,
  plugin: steamProvider,
  command: "steam",
  systems: ["steam"],
  settings: {
    plugin: { state: { root: "{storage:@korri:steam/steam}" } },
  },
  ...overrides,
})

const steamReadableSnapshot = (
  input: {
    readonly app?: AppRecord
    readonly users?: ReadonlyMap<string, UserRecord>
  } = {},
): ReadableConfigSnapshot => ({
  host: null,
  users: input.users ?? new Map(),
  systems: new Map([["steam", { id: "steam" }]]),
  sources: new Map([["steam", { id: "steam", kind: ["service"] }]]),
  storage: new Map([[steamAppId, { id: steamAppId, root: "/state" }]]),
  readableLaunchers: input.app
    ? new Map([[input.app.id, input.app]])
    : new Map(),
  runtimes: new Map(),
  profiles: new Map(),
  library: new Map([
    [
      "balatro",
      {
        id: "balatro",
        title: "Balatro",
        releases: [
          {
            id: "steam",
            system: "steam",
            target: {
              kind: "provider-ref",
              provider: "@korri:steam",
              ref: "2379780",
            },
            launch: { use: steamAppId },
          },
        ],
      },
    ],
  ]),
})

describe("foldPluginPolicies", () => {
  it("deep-merges provider-scoped maps and concatenates arrays", () => {
    expect(
      foldPluginPolicies(
        {
          "@example:runtime": {
            env: { A: "1" },
            extra: { args: ["--base"], config: { a: true } },
          },
        },
        {
          "@example:runtime": {
            env: { B: "2" },
            extra: { args: ["--override"], config: { b: true } },
          },
        },
      ),
    ).toEqual({
      "@example:runtime": {
        env: { A: "1", B: "2" },
        extra: {
          args: ["--base", "--override"],
          config: { a: true, b: true },
        },
      },
    })
  })
})

describe("resolveReadableLaunchContext", () => {
  it("carries release launch settings for readable app env substitution", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(snapshot(), {
        playableId: "sonic-the-hedgehog",
      }),
    )

    expect(context.settings?.plugin).toMatchObject({
      extraSettings: { video_font_enable: true },
      extraArgs: ["release"],
    })
  })

  it("resolves source, app, runtime, file content, and cascade order", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(snapshot(), {
        playableId: "sonic-the-hedgehog",
        userId: "simon",
        profileId: "handheld",
        override: {
          env: { SCALE: "override" },
          ...wrapperLaunch({
            extraArgs: ["override"],
            environment: { OUTER_UNSET: null },
          }),
          moonlight: { stream: { fps: 30 } },
        },
      }),
    )

    expect(context.playableId).toBe("sonic-the-hedgehog")
    expect(context.releaseId).toBe("genesis")
    expect(context.app.id).toBe("@korri:retroarch/retroarch")
    expect(context.runtime?.path).toBe("/cores/genesis_plus_gx.so")
    expect(context.target).toBe("genesis/Sonic.md")
    expect(context.content?.path).toBe("/games/genesis/Sonic.md")
    expect(wrapperPolicyFrom(context)?.enable).toBe(true)
    expect(wrapperPolicyFrom(context)?.environment).toEqual({
      OUTER_ONLY: "host",
      OUTER_UNSET: null,
    })
    expect(wrapperPolicyFrom(context)?.app?.environment).toEqual({
      WAYLAND_DISPLAY: null,
    })
    expect(wrapperPolicyFrom(context)?.display).toEqual({
      output: { width: 640, height: 480 },
    })
    expect(wrapperPolicyFrom(context)?.backend).toEqual({
      allowDeferred: true,
    })
    expect(wrapperPolicyFrom(context)?.scaling?.filter).toBe("fsr")
    expect(wrapperPolicyFrom(context)?.extraArgs).toEqual([
      "host",
      "user",
      "app",
      "runtime",
      "item",
      "release",
      "profile",
      "override",
    ])
    expect(context.moonlight).toMatchObject({
      environment: { ML_KEEP: "host", ML_UNSET: null },
      platform: { name: "v4l2m2m" },
      logging: { verbose: true },
      stream: { resolution: { width: 1280, height: 720 }, fps: 30 },
      input: { devices: ["/dev/input/event-host", "/dev/input/event-user"] },
      window: { autoResize: false },
      extraArgs: [
        "host",
        "user",
        "app",
        "runtime",
        "item",
        "release",
        "profile",
      ],
    })
    expect(context.plugin?.[retroarchProvider]).toMatchObject({
      environment: { RA_KEEP: "host", RA_UNSET: null },
      configFile: { append: ["/tmp/host.cfg", "/tmp/user.cfg"] },
      core: { path: "/cores/runtime-override.so" },
      logging: { verbosity: false, fpsShow: true },
      drivers: { video: "glcore", menu: "ozone" },
      paths: {
        systemDirectory: "/bios",
        cacheDirectory: "/source/cache",
        thumbnailsDirectory: "/user/thumbnails",
      },
      lifecycle: { saveOnExit: false },
      video: {
        fullscreen: false,
        sync: {
          hardSync: true,
          hardSyncFrames: 1,
          frameDelay: 99,
          frameDelayAuto: true,
        },
      },
      audio: { mute: true, outputRate: 48000 },
      input: {
        ports: {
          "1": { libretroDevice: 1, joypadIndex: 2, analogDpadMode: 1 },
          "2": { libretroDevice: 257, joypadIndex: 1 },
        },
      },
      menu: {
        showStartScreen: false,
        pauseLibretro: true,
        pointerEnable: true,
      },
      saves: {
        autosaveIntervalSeconds: 60,
        autoLoadState: true,
        autoSaveState: true,
      },
      rewind: { enable: true, bufferSizeMb: 24, granularity: 2 },
      playback: {
        pauseNonactive: true,
        slowmotionRatio: 3,
        fastforwardRatio: 0,
      },
      latency: {
        runAhead: { enable: true, frames: 2 },
        preemptiveFrames: { enable: true, frames: 3 },
      },
      achievements: {
        enable: true,
        username: "user-name",
        badges: false,
        hardcoreMode: true,
      },
      haptics: { vibrateOnKeypress: false, deviceVibration: true },
      playlists: { useOldFormat: false },
      privacy: {
        cameraAllow: false,
        locationAllow: false,
        cameraDevice: "/dev/video0",
      },
      updater: {
        showOnlineUpdater: false,
        showCoreUpdater: false,
        buildbotUrl: null,
        buildbotAssetsUrl: "https://updates.example.invalid/assets",
      },
      extraSettings: { video_font_enable: false },
      extraArgs: ["host", "app", "runtime", "release", "profile"],
    })
    expect(context.env?.SCALE).toBe("override")
  })

  it("ignores stale top-level wrapper readable overrides", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(snapshot(), {
        playableId: "sonic-the-hedgehog",
        override: {
          [retiredWrapperKey]: { enable: false },
          ...wrapperLaunch({ enable: true, extraArgs: ["override"] }),
        } as never,
      }),
    )

    expect(wrapperPolicyFrom(context)?.enable).toBe(true)
    expect(wrapperPolicyFrom(context)?.extraArgs).toContain("override")
  })

  it("selects the explicit release launch", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...snapshot(),
          systems: new Map([["genesis", system]]),
          sources: new Map([
            ["roms", { ...source, app: undefined, runtime: undefined }],
          ]),
        },
        { playableId: "sonic-the-hedgehog" },
      ),
    )

    expect(context.app.id).toBe("@korri:retroarch/retroarch")
    expect(context.runtime?.id).toBe("genesis-plus-gx")
  })

  it("lets an explicit appId override the release launch selection", async () => {
    const pluginApp: AppRecord = {
      id: "plugin-app",
      command: "plugin-app",
      args: ["{content.path}"],
      systems: ["genesis"],
    }
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...snapshot({
            ...sonic,
            releases: [
              {
                id: "genesis",
                system: "genesis",
                target: {
                  kind: "file",
                  storage: "roms",
                  path: "genesis/Sonic.md",
                },
                launch: { use: "plugin-app", argsAppend: ["release"] },
              },
            ],
          }),
          systems: new Map([["genesis", system]]),
          sources: new Map([
            ["roms", { ...source, app: undefined, runtime: undefined }],
          ]),
          readableLaunchers: new Map([
            ["@korri:retroarch/retroarch", app],
            ["plugin-app", pluginApp],
          ]),
        },
        { playableId: "sonic-the-hedgehog", appId: "plugin-app" },
      ),
    )

    expect(context.app.id).toBe("plugin-app")
    expect(context.argsAppend).toEqual(["release"])
  })

  it("rejects missing release launches and unknown explicit launcher selections", async () => {
    const base = {
      ...snapshot(),
      systems: new Map([["genesis", system]]),
      sources: new Map([
        ["roms", { ...source, app: undefined, runtime: undefined }],
      ]),
    }

    const notLaunchable = await Effect.runPromise(
      Effect.flip(
        resolveReadableLaunchContext(
          {
            ...base,
            library: new Map([
              [
                "sonic-the-hedgehog",
                {
                  ...sonic,
                  releases: [
                    {
                      id: "genesis",
                      system: "genesis",
                      target: {
                        kind: "file",
                        storage: "roms",
                        path: "genesis/Sonic.md",
                      },
                    },
                  ],
                },
              ],
            ]),
          },
          {
            playableId: "sonic-the-hedgehog",
          },
        ),
      ),
    )
    expect(notLaunchable).toMatchObject({ _tag: "NoLaunchableRelease" })

    const unknown = await Effect.runPromise(
      Effect.flip(
        resolveReadableLaunchContext(base, {
          playableId: "sonic-the-hedgehog",
          appId: "missing",
        }),
      ),
    )
    expect(unknown).toMatchObject({
      _tag: "AppNotFound",
      appId: "missing",
    })
  })

  it("rejects releases without launch selection", async () => {
    const exit = await Effect.runPromiseExit(
      resolveReadableLaunchContext(
        {
          ...snapshot({
            ...sonic,
            releases: [
              {
                id: "genesis",
                system: "genesis",
                target: {
                  kind: "file",
                  storage: "roms",
                  path: "genesis/Sonic.md",
                },
              },
            ],
          }),
          systems: new Map([["genesis", { id: "genesis" }]]),
        },
        { playableId: "sonic-the-hedgehog" },
      ),
    )

    expect(exit._tag).toBe("Failure")
    expect(String(exit)).toContain("NoLaunchableRelease")
  })

  it("materializes built-in app overrides for readable launch composition", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...snapshot(),
          readableLaunchers: new Map([
            [
              "@korri:retroarch/retroarch",
              {
                ...app,
                settings: { video_fullscreen: false },
              },
            ],
          ]),
        },
        { playableId: "sonic-the-hedgehog" },
      ),
    )
    expect(context.app.id).toBe("@korri:retroarch/retroarch")
    expect(context.app.plugin).toBe(retroarchProvider)
    expect(context.app.args).toEqual(["-L", "{runtime.path}", "{content.path}"])
    expect(context.plugin?.[retroarchProvider]).toBeDefined()
  })

  it("preserves extraArgs-only wrapper policies without provider-specific defaults", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...snapshot({
            ...sonic,
            releases: [
              {
                id: "genesis",
                system: "genesis",
                target: {
                  kind: "file",
                  storage: "roms",
                  path: "genesis/Sonic.md",
                },
                launch: {
                  use: "@korri:retroarch/retroarch",
                  with: { [wrapperProvider]: { extraArgs: ["release"] } },
                },
              },
            ],
          }),
          host: null,
          users: new Map(),
          systems: new Map([
            [
              "genesis",
              {
                id: "genesis",
                title: "Genesis",
              },
            ],
          ]),
          sources: new Map([
            [
              "roms",
              {
                id: "roms",
                kind: ["files"],
                storage: "roms",
              },
            ],
          ]),
          readableLaunchers: new Map([
            ["@korri:retroarch/retroarch", { ...app, launch: undefined }],
          ]),
          runtimes: new Map(),
          profiles: new Map([
            [
              "extra-args-only",
              {
                id: "extra-args-only",
                ...wrapperLaunch({ extraArgs: ["--fps-limit", "60"] }),
              },
            ],
          ]),
        },
        { playableId: "sonic-the-hedgehog", profileId: "extra-args-only" },
      ),
    )

    expect(wrapperPolicyFrom(context)?.enable).toBeUndefined()
    expect(wrapperPolicyFrom(context)?.backend).toBeUndefined()
    expect(wrapperPolicyFrom(context)?.extraArgs).toEqual([
      "item",
      "release",
      "--fps-limit",
      "60",
    ])
  })

  it("resolves Steam app choices through plugin payload defaults and choice overrides", async () => {
    const steam = steamApp({
      runtime: "proton-default",
      settings: {
        plugin: {
          state: { root: "{storage:@korri:steam/steam}" },
          extra: { args: ["-silent"] },
          "launch-options": "%command%",
        },
      },
    })
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...snapshot(),
          readableLaunchers: new Map([
            ["@korri:retroarch/retroarch", app],
            [steamAppId, steam],
          ]),
          runtimes: new Map([
            [
              "proton-default",
              {
                id: "proton-default",
                kind: "tool",
                path: "/compat/default",
                tool: "proton-default",
              },
            ],
            [
              "proton-experimental",
              {
                id: "proton-experimental",
                kind: "tool",
                path: "/compat/experimental",
                tool: "proton-experimental",
              },
            ],
          ]),
          systems: new Map([["steam", { id: "steam" }]]),
          sources: new Map([["steam", { id: "steam", kind: ["service"] }]]),
          storage: new Map([[steamAppId, { id: steamAppId, root: "/state" }]]),
          library: new Map([
            [
              "balatro",
              {
                id: "balatro",
                title: "Balatro",
                releases: [
                  {
                    id: "steam",
                    system: "steam",
                    target: { kind: "url", value: "steam://rungameid/2379780" },
                    launch: {
                      use: steamAppId,
                      runtime: "proton-experimental",
                      settings: {
                        plugin: {
                          extra: { args: ["-gamepadui"] },
                          "launch-options": "wrapper -- %command%",
                        },
                      },
                    },
                  },
                ],
              },
            ],
          ]),
        },
        { playableId: "balatro" },
      ),
    )

    expect(context.app.id).toBe(steamAppId)
    expect(context.runtime?.id).toBe("proton-experimental")
    expect(context).not.toHaveProperty("steam")
    expect(context.plugin?.[steamProvider]).toEqual({
      state: { root: "{storage:@korri:steam/steam}" },
      extra: { args: ["-silent", "-gamepadui"] },
      "launch-options": "wrapper -- %command%",
    })
  })

  it("resolves direct plugin launch selectors through enabled launchers", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...steamReadableSnapshot({ app: steamApp() }),
          library: new Map([
            [
              "balatro",
              {
                id: "balatro",
                title: "Balatro",
                releases: [
                  {
                    id: "steam",
                    system: "steam",
                    target: { kind: "url", value: "steam://rungameid/2379780" },
                    launch: { plugin: steamProvider },
                  },
                ],
              },
            ],
          ]),
        },
        { playableId: "balatro" },
      ),
    )

    expect(context.app.id).toBe(steamAppId)
    expect(context.plugin?.[steamProvider]).toEqual({
      state: { root: "{storage:@korri:steam/steam}" },
    })
  })

  it("does not fold release-scoped plugin content path overrides", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...snapshot(),
          library: new Map([
            [
              "sonic-the-hedgehog",
              {
                ...sonic,
                releases: [
                  {
                    id: "genesis",
                    system: "genesis",
                    target: {
                      kind: "file",
                      storage: "roms",
                      path: "genesis/Sonic.md",
                    },
                    launch: {
                      use: "@korri:retroarch/retroarch",
                      runtime: "genesis-plus-gx",
                      settings: {
                        plugin: {
                          content: { path: "/outside/Sonic.md" },
                          extraArgs: ["--safe"],
                        },
                      },
                    },
                  },
                ],
              },
            ],
          ]),
        },
        { playableId: "sonic-the-hedgehog" },
      ),
    )

    expect(context.content?.path).toBe("/games/genesis/Sonic.md")
    const retroarchPolicy = context.plugin?.[retroarchProvider] as
      | { readonly extraArgs?: readonly string[] }
      | undefined
    expect(retroarchPolicy?.extraArgs).toContain("--safe")
    expect(context.plugin?.[retroarchProvider]).not.toHaveProperty("content")
  })

  it("keeps an active Steam integration free of generic wrapper policy", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(steamReadableSnapshot({ app: steamApp() }), {
        playableId: "balatro",
      }),
    )

    expect(context.app).toMatchObject({
      id: steamAppId,
      plugin: steamProvider,
      command: "steam",
    })
    expect(wrapperPolicyFrom(context)).toBeUndefined()
    const policies = launchCompanionPoliciesFrom(context)
    expect(policies.every(policy => policy.display === undefined)).toBe(true)
    expect(policies.every(policy => policy.scaling === undefined)).toBe(true)
    expect(policies.every(policy => policy.stats === undefined)).toBe(true)
    expect(context).not.toHaveProperty("steam")
    expect(context.plugin?.[steamProvider]).toEqual({
      state: { root: "{storage:@korri:steam/steam}" },
    })
  })

  it("keeps app-scoped wrapper tuning independent from Steam integration", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        steamReadableSnapshot({
          app: steamApp(
            wrapperLaunch({
              display: { nested: { width: 854, height: 480 } },
            }),
          ),
        }),
        { playableId: "balatro" },
      ),
    )

    const wrapperPolicy = wrapperPolicyFrom(context)
    if (wrapperPolicy === undefined) throw new Error("expected wrapper policy")
    expect(wrapperPolicy).toMatchObject({
      display: { nested: { width: 854, height: 480 } },
    })
  })

  it("lets app-scoped Steam wrapper config disable the integration baseline", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        steamReadableSnapshot({
          app: steamApp(wrapperLaunch({ enable: false })),
        }),
        { playableId: "balatro" },
      ),
    )

    expect(wrapperPolicyFrom(context)).toEqual({ enable: false })
  })

  it("does not let a generic user-level wrapper disable override the Steam app baseline", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        steamReadableSnapshot({
          app: steamApp(),
          users: new Map([
            ["simon", { id: "simon", ...wrapperLaunch({ enable: false }) }],
          ]),
        }),
        { playableId: "balatro", userId: "simon" },
      ),
    )

    const wrapperPolicy = wrapperPolicyFrom(context)
    if (wrapperPolicy === undefined) throw new Error("expected wrapper policy")
    expect(wrapperPolicy.enable).toBe(false)
    expect(wrapperPolicy.steam).toBeUndefined()
  })

  it("requires the plugin-qualified Steam app before Steam is active", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        resolveReadableLaunchContext(steamReadableSnapshot(), {
          playableId: "balatro",
        }),
      ),
    )

    expect(error).toMatchObject({ _tag: "AppNotFound", appId: steamAppId })
  })

  it("rejects runtime/app mismatches through shared launch compatibility", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        resolveReadableLaunchContext(
          {
            ...snapshot(),
            runtimes: new Map([
              [
                "genesis-plus-gx",
                {
                  ...runtime,
                  app: steamAppId,
                },
              ],
            ]),
          },
          { playableId: "sonic-the-hedgehog" },
        ),
      ),
    )

    expect(error).toMatchObject({
      _tag: "IncompatibleLaunchSelection",
      appId: "@korri:retroarch/retroarch",
      runtimeId: "genesis-plus-gx",
      systemId: "genesis",
    })
  })

  it("rejects runtime/system mismatches through shared launch compatibility", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        resolveReadableLaunchContext(
          {
            ...snapshot(),
            runtimes: new Map([
              [
                "genesis-plus-gx",
                {
                  ...runtime,
                  supports: { systems: ["gba"] },
                },
              ],
            ]),
          },
          { playableId: "sonic-the-hedgehog" },
        ),
      ),
    )

    expect(error).toMatchObject({
      _tag: "IncompatibleLaunchSelection",
      appId: "@korri:retroarch/retroarch",
      runtimeId: "genesis-plus-gx",
      systemId: "genesis",
    })
  })

  it("keeps app choice selection independent of profile app fields", async () => {
    const steam: AppRecord = {
      id: steamAppId,
      plugin: steamProvider,
      command: "steam",
      args: ["{target}"],
      systems: ["windows"],
      settings: { plugin: { state: { root: "/steam" } } },
    }
    const proton: RuntimeRecord = {
      id: "proton",
      kind: "tool",
      path: "/runtimes/proton",
    }
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...snapshot(),
          readableLaunchers: new Map([
            ["@korri:retroarch/retroarch", app],
            [steamAppId, steam],
          ]),
          runtimes: new Map([
            ["genesis-plus-gx", runtime],
            ["proton", proton],
          ]),
          systems: new Map([["genesis", system]]),
          profiles: new Map([
            ["handheld", { ...profile, app: steamAppId, runtime: "proton" }],
          ]),
        },
        {
          playableId: "sonic-the-hedgehog",
          profileId: "handheld",
          appId: "@korri:retroarch/retroarch",
        },
      ),
    )

    expect(context.app.id).toBe("@korri:retroarch/retroarch")
    expect(context.runtime?.id).toBe("genesis-plus-gx")
  })

  it("applies package releases to contained playables", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(snapshot(gbaPackage), {
        playableId: "super-mario-advance-2/super-mario-world",
      }),
    )

    expect(context.playableId).toBe("super-mario-advance-2/super-mario-world")
    expect(context.itemId).toBe("super-mario-advance-2")
    expect(context.containedId).toBe("super-mario-world")
    expect(context.releaseId).toBe("gba")
    expect(wrapperPolicyFrom(context)?.extraArgs).toContain("contained")
  })

  it("rejects release omission when multiple launchable releases exist", async () => {
    const exit = await Effect.runPromiseExit(
      resolveReadableLaunchContext(snapshot(sonicMulti), {
        playableId: "sonic-the-hedgehog",
      }),
    )

    expect(exit._tag).toBe("Failure")
    expect(String(exit)).toContain("AmbiguousRelease")
  })

  it("resolves file-set releases through explicit launch input", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        snapshot({
          ...sonic,
          releases: [
            {
              id: "multi",
              system: "genesis",
              target: {
                kind: "file-set",
                storage: "roms",
                root: "genesis",
                files: [
                  { id: "readme", role: "manual", path: "README.txt" },
                  { id: "disc1", role: "entrypoint", path: "disc1.cue" },
                ],
              },
              launch: {
                use: "@korri:retroarch/retroarch",
                runtime: "genesis-plus-gx",
                input: { part: "disc1" },
              },
            },
          ],
        }),
        { playableId: "sonic-the-hedgehog" },
      ),
    )

    expect(context.target).toBe("genesis/disc1.cue")
    expect(context.content?.path).toBe("/games/genesis/disc1.cue")
  })

  it("rejects known-only release selection", async () => {
    const exit = await Effect.runPromiseExit(
      resolveReadableLaunchContext(
        snapshot({
          ...sonic,
          releases: [
            { id: "known", system: "windows" },
            {
              id: "genesis",
              system: "genesis",
              target: {
                kind: "file",
                storage: "roms",
                path: "genesis/Sonic.md",
              },
            },
          ],
        }),
        { playableId: "sonic-the-hedgehog", releaseId: "known" },
      ),
    )

    expect(exit._tag).toBe("Failure")
    expect(String(exit)).toContain("ReleaseNotLaunchable")
  })
})
