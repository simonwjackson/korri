import { describe, expect, it } from "bun:test"
import { Effect } from "effect"

import {
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
  retroarch: {
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
  retroarch: {
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
}
const system: SystemRecord = {
  id: "genesis",
  apps: [{ id: "retroarch", runtime: "genesis-plus-gx" }],
  ...wrapperLaunch({
    extraArgs: ["system"],
    display: { nested: { width: 320 } },
  }),
  moonlight: { extraArgs: ["system"], window: { autoResize: true } },
  retroarch: { extraArgs: ["system"] },
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
  retroarch: {
    paths: { systemDirectory: "/bios", cacheDirectory: "/source/cache" },
    extraArgs: ["source"],
  },
}
const app: AppRecord = {
  id: "retroarch",
  kind: "retroarch",
  command: "retroarch",
  args: ["-L", "{runtime.path}", "{content.path}"],
  systems: ["genesis"],
  ...wrapperLaunch({ extraArgs: ["app"], backend: { allowDeferred: true } }),
  moonlight: {
    extraArgs: ["app"],
    logging: { verbose: true },
    platform: { name: "v4l2m2m" },
  },
  paths: { systemDirectory: "/bios", cacheDirectory: "/source/cache" },
  lifecycle: { saveOnExit: false },
  extraArgs: ["app"],
}
const runtime: RuntimeRecord = {
  id: "genesis-plus-gx",
  kind: "libretro-core",
  path: "/cores/genesis_plus_gx.so",
  ...wrapperLaunch({ extraArgs: ["runtime"], scaling: { filter: "fsr" } }),
  moonlight: { extraArgs: ["runtime"], stream: { fps: 60 } },
  retroarch: {
    core: { path: "/cores/runtime-override.so" },
    extraArgs: ["runtime"],
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
  retroarch: {
    environment: { RA_UNSET: null },
    video: { fullscreen: false, sync: { hardSyncFrames: 1 } },
    audio: { mute: true },
    extraSettings: { video_font_enable: false },
    extraArgs: ["profile"],
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
      ...wrapperLaunch({ extraArgs: ["release"] }),
      moonlight: { extraArgs: ["release"] },
      retroarch: {
        extraSettings: { video_font_enable: true },
        extraArgs: ["release"],
      },
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
    },
    { id: "steam", system: "windows", target: "steam://rungameid/71113" },
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
    },
  ],
}

const snapshot = (item: LibraryItemRecord = sonic): ReadableConfigSnapshot => ({
  host,
  users: new Map([["simon", user]]),
  systems: new Map([["genesis", system]]),
  sources: new Map([["roms", source]]),
  apps: new Map([["retroarch", app]]),
  runtimes: new Map([["genesis-plus-gx", runtime]]),
  profiles: new Map([["handheld", profile]]),
  storage: new Map([["roms", storage]]),
  library: new Map([[item.id, item]]),
})

const steamApp = (overrides: Partial<AppRecord> = {}): AppRecord => ({
  id: "steam",
  kind: "steam",
  state: { root: "{storage:steam}/Steam" },
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
  systems: new Map([["steam", { id: "steam", apps: [{ id: "steam" }] }]]),
  sources: new Map([["steam", { id: "steam", kind: ["service"] }]]),
  storage: new Map([["steam", { id: "steam", root: "/state" }]]),
  apps: input.app ? new Map([[input.app.id, input.app]]) : new Map(),
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
            target: "steam://rungameid/2379780",
          },
        ],
      },
    ],
  ]),
})

describe("resolveReadableLaunchContext", () => {
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
    expect(context.app.id).toBe("retroarch")
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
      nested: { width: 320 },
    })
    expect(wrapperPolicyFrom(context)?.backend).toEqual({
      allowDeferred: true,
    })
    expect(wrapperPolicyFrom(context)?.scaling?.filter).toBe("fsr")
    expect(wrapperPolicyFrom(context)?.extraArgs).toEqual([
      "host",
      "user",
      "system",
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
        "system",
        "app",
        "runtime",
        "item",
        "release",
        "profile",
      ],
    })
    expect(context.retroarch).toMatchObject({
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
      extraArgs: ["host", "system", "app", "runtime", "release", "profile"],
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

  it("selects a single inherited system app choice", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...snapshot(),
          systems: new Map([
            [
              "genesis",
              {
                ...system,
                apps: [{ id: "retroarch", runtime: "genesis-plus-gx" }],
              },
            ],
          ]),
          sources: new Map([
            ["roms", { ...source, app: undefined, runtime: undefined }],
          ]),
        },
        { playableId: "sonic-the-hedgehog" },
      ),
    )

    expect(context.app.id).toBe("retroarch")
    expect(context.runtime?.id).toBe("genesis-plus-gx")
  })

  it("overlays release app choices and selects by appId", async () => {
    const ryubing: AppRecord = {
      id: "ryubing",
      command: "ryubing",
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
                apps: [{ id: "ryubing", argsAppend: ["release"] }],
              },
            ],
          }),
          systems: new Map([
            [
              "genesis",
              {
                ...system,
                apps: [
                  { id: "retroarch", runtime: "genesis-plus-gx" },
                  { id: "ryubing", argsAppend: ["system"] },
                ],
              },
            ],
          ]),
          sources: new Map([
            ["roms", { ...source, app: undefined, runtime: undefined }],
          ]),
          apps: new Map([
            ["retroarch", app],
            ["ryubing", ryubing],
          ]),
        },
        { playableId: "sonic-the-hedgehog", appId: "ryubing" },
      ),
    )

    expect(context.app.id).toBe("ryubing")
    expect(context.argsAppend).toEqual(["system", "release"])
  })

  it("rejects ambiguous and unknown app choice selections", async () => {
    const base = {
      ...snapshot(),
      systems: new Map([
        [
          "genesis",
          {
            ...system,
            apps: [{ id: "retroarch" }, { id: "ryubing" }],
          },
        ],
      ]),
      sources: new Map([
        ["roms", { ...source, app: undefined, runtime: undefined }],
      ]),
    }

    const ambiguous = await Effect.runPromise(
      Effect.flip(
        resolveReadableLaunchContext(base, {
          playableId: "sonic-the-hedgehog",
        }),
      ),
    )
    expect(ambiguous).toMatchObject({
      _tag: "AmbiguousAppChoice",
      appIds: ["retroarch", "ryubing"],
    })

    const unknown = await Effect.runPromise(
      Effect.flip(
        resolveReadableLaunchContext(base, {
          playableId: "sonic-the-hedgehog",
          appId: "missing",
        }),
      ),
    )
    expect(unknown).toMatchObject({
      _tag: "AppChoiceNotFound",
      appId: "missing",
      appIds: ["retroarch", "ryubing"],
    })
  })

  it("rejects launchable releases without app choices", async () => {
    const exit = await Effect.runPromiseExit(
      resolveReadableLaunchContext(
        {
          ...snapshot(),
          systems: new Map([["genesis", { id: "genesis" }]]),
        },
        { playableId: "sonic-the-hedgehog" },
      ),
    )

    expect(exit._tag).toBe("Failure")
    expect(String(exit)).toContain("ReleaseNotLaunchable")
  })

  it("materializes built-in app overrides for readable launch composition", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...snapshot(),
          apps: new Map([
            [
              "retroarch",
              {
                id: "retroarch",
                settings: { video_fullscreen: false },
              },
            ],
          ]),
        },
        { playableId: "sonic-the-hedgehog" },
      ),
    )
    expect(context.app.id).toBe("retroarch")
    expect(context.app.kind).toBe("retroarch")
    expect(context.app.args).toEqual([])
    expect(context.retroarch).toBeDefined()
  })

  it("preserves extraArgs-only wrapper policies without provider-specific defaults", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...snapshot(),
          host: null,
          users: new Map(),
          systems: new Map([
            [
              "genesis",
              { id: "genesis", title: "Genesis", apps: [{ id: "retroarch" }] },
            ],
          ]),
          sources: new Map([
            [
              "roms",
              {
                id: "roms",
                kind: ["files"],
                storage: "roms",
                app: "retroarch",
              },
            ],
          ]),
          apps: new Map([["retroarch", { ...app, launch: undefined }]]),
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

  it("resolves Steam app choices through app defaults and choice overrides", async () => {
    const steam: AppRecord = {
      id: "steam",
      kind: "steam",
      command: "steam",
      runtime: "proton-default",
      state: { root: "{storage:steam}/Steam" },
      extra: { args: ["-silent"] },
      "launch-options": "%command%",
    }
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...snapshot(),
          apps: new Map([
            ["retroarch", app],
            ["steam", steam],
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
          systems: new Map([
            [
              "steam",
              {
                id: "steam",
                apps: [{ id: "steam", extra: { args: ["-gamepadui"] } }],
              },
            ],
          ]),
          sources: new Map([["steam", { id: "steam", kind: ["service"] }]]),
          storage: new Map([["steam", { id: "steam", root: "/state" }]]),
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
                    target: "steam://rungameid/2379780",
                    apps: [
                      {
                        id: "steam",
                        runtime: "proton-experimental",
                        "launch-options": "wrapper -- %command%",
                      },
                    ],
                  },
                ],
              },
            ],
          ]),
        },
        { playableId: "balatro" },
      ),
    )

    expect(context.app.id).toBe("steam")
    expect(context.runtime?.id).toBe("proton-experimental")
    expect(context.steam).toEqual({
      state: { root: "{storage:steam}/Steam" },
      extra: { args: ["-silent", "-gamepadui"] },
      "launch-options": "wrapper -- %command%",
    })
  })

  it("keeps an active Steam integration free of generic wrapper policy", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(steamReadableSnapshot({ app: steamApp() }), {
        playableId: "balatro",
      }),
    )

    expect(context.app).toMatchObject({
      id: "steam",
      kind: "steam",
      command: "steam",
      args: [],
    })
    expect(wrapperPolicyFrom(context)).toBeUndefined()
    const policies = launchCompanionPoliciesFrom(context)
    expect(policies.every(policy => policy.display === undefined)).toBe(true)
    expect(policies.every(policy => policy.scaling === undefined)).toBe(true)
    expect(policies.every(policy => policy.stats === undefined)).toBe(true)
    expect(context.steam).toEqual({
      state: { root: "{storage:steam}/Steam" },
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

  it("requires apps.steam before the Steam built-in baseline is active", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        resolveReadableLaunchContext(steamReadableSnapshot(), {
          playableId: "balatro",
        }),
      ),
    )

    expect(error).toMatchObject({ _tag: "AppNotFound", appId: "steam" })
  })

  it("rejects Steam launch-options when the selected app is not Steam", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        resolveReadableLaunchContext(
          {
            ...snapshot(),
            systems: new Map([
              [
                "genesis",
                {
                  ...system,
                  apps: [
                    {
                      id: "retroarch",
                      runtime: "genesis-plus-gx",
                      "launch-options": "%command%",
                    },
                  ],
                },
              ],
            ]),
          },
          { playableId: "sonic-the-hedgehog" },
        ),
      ),
    )

    expect(error).toMatchObject({
      _tag: "InvalidAppChoiceForKind",
      appId: "retroarch",
      field: "launch-options",
      kind: "retroarch",
    })
  })

  it("keeps app choice selection independent of profile app fields", async () => {
    const steam: AppRecord = {
      id: "steam",
      command: "steam",
      args: ["{target}"],
      systems: ["windows"],
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
          apps: new Map([
            ["retroarch", app],
            ["steam", steam],
          ]),
          runtimes: new Map([
            ["genesis-plus-gx", runtime],
            ["proton", proton],
          ]),
          systems: new Map([
            [
              "genesis",
              {
                ...system,
                apps: [
                  { id: "retroarch", runtime: "genesis-plus-gx" },
                  { id: "steam", runtime: "proton" },
                ],
              },
            ],
          ]),
          profiles: new Map([
            ["handheld", { ...profile, app: "steam", runtime: "proton" }],
          ]),
        },
        {
          playableId: "sonic-the-hedgehog",
          profileId: "handheld",
          appId: "retroarch",
        },
      ),
    )

    expect(context.app.id).toBe("retroarch")
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

  it("threads and folds Ryubing policy including per-game state.root overrides", async () => {
    const ryubingApp: AppRecord = {
      id: "ryubing",
      kind: "ryubing",
      command: "/bin/Ryujinx",
      state: { root: "{storage:switch-card}/shared/Ryujinx", create: true },
      env: { XDG_CONFIG_HOME: "{storage:switch-card}/.config" },
      graphics: { backend: "vulkan" },
      extra: { args: ["app-arg"], config: { app_key: true } },
    }
    const switchItem: LibraryItemRecord = {
      id: "mario-kart-8-deluxe",
      ryubing: {
        graphics: { "backend-threading": "auto" },
        extra: { args: ["item-arg"], config: { nested: { item: true } } },
      },
      releases: [
        {
          id: "switch",
          system: "switch",
          target: {
            kind: "file",
            storage: "switch-card",
            path: "roms/switch/Mario Kart 8 Deluxe.nsp",
          },
          apps: [{ id: "ryubing" }],
          ryubing: {
            state: { root: "{storage:switch-card}/per-game/mk8d" },
            console: { mode: "handheld" },
            extra: {
              args: ["release-arg"],
              config: { nested: { release: true } },
            },
          },
        },
      ],
    }

    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...snapshot(switchItem),
          systems: new Map([
            ["switch", { id: "switch", apps: [{ id: "ryubing" }] }],
          ]),
          sources: new Map([
            [
              "switch-card",
              { id: "switch-card", kind: ["files"], storage: "switch-card" },
            ],
          ]),
          storage: new Map([
            ["switch-card", { id: "switch-card", root: "/media/switch" }],
          ]),
          apps: new Map([["ryubing", ryubingApp]]),
          runtimes: new Map(),
        },
        { playableId: "mario-kart-8-deluxe" },
      ),
    )

    expect(context.app.id).toBe("ryubing")
    expect(context.content?.path).toBe(
      "/media/switch/roms/switch/Mario Kart 8 Deluxe.nsp",
    )
    expect(context.ryubing?.state?.root).toBe(
      "{storage:switch-card}/per-game/mk8d",
    )
    expect(context.ryubing?.env?.XDG_CONFIG_HOME).toBe(
      "{storage:switch-card}/.config",
    )
    expect(context.ryubing?.graphics).toEqual({
      backend: "vulkan",
      "backend-threading": "auto",
    })
    expect(context.ryubing?.console?.mode).toBe("handheld")
    expect(context.ryubing?.extra?.args).toEqual([
      "app-arg",
      "item-arg",
      "release-arg",
    ])
    expect(context.ryubing?.extra?.config).toEqual({
      app_key: true,
      nested: { item: true, release: true },
    })
    expect(context.storage?.["switch-card"]?.root).toBe("/media/switch")
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

  it("fails explicitly instead of crashing for multi-target releases", async () => {
    const exit = await Effect.runPromiseExit(
      resolveReadableLaunchContext(
        snapshot({
          ...sonic,
          releases: [
            {
              id: "multi",
              system: "genesis",
              target: ["disc1.cue", "disc2.cue"],
            },
          ],
        }),
        { playableId: "sonic-the-hedgehog" },
      ),
    )

    expect(exit._tag).toBe("Failure")
    expect(String(exit)).toContain("MultiTargetUnsupported")
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
