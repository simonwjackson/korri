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

const host: HostRecord = {
  id: "local",
  gamescope: {
    enable: true,
    extraArgs: ["host"],
    environment: { OUTER_ONLY: "host", OUTER_UNSET: "1" },
    display: { output: { width: 640 } },
  },
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
  gamescope: {
    extraArgs: ["user"],
    app: { environment: { WAYLAND_DISPLAY: "wayland-1" } },
    display: { output: { height: 480 } },
  },
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
  gamescope: { extraArgs: ["system"], display: { nested: { width: 320 } } },
  moonlight: { extraArgs: ["system"], window: { autoResize: true } },
  retroarch: { extraArgs: ["system"] },
}
const source: SourceRecord = {
  id: "roms",
  kind: ["files"],
  storage: "roms",
  app: "retroarch",
  runtime: "genesis-plus-gx",
  gamescope: { extraArgs: ["source"], display: { nested: { height: 240 } } },
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
  gamescope: { extraArgs: ["app"], backend: { allowDeferred: true } },
  moonlight: { extraArgs: ["app"], logging: { verbose: true } },
  lifecycle: { saveOnExit: false },
  extraArgs: ["app"],
}
const runtime: RuntimeRecord = {
  id: "genesis-plus-gx",
  kind: "libretro-core",
  path: "/cores/genesis_plus_gx.so",
  gamescope: { extraArgs: ["runtime"], scaling: { filter: "fsr" } },
  moonlight: { extraArgs: ["runtime"], stream: { fps: 60 } },
  retroarch: {
    core: { path: "/cores/runtime-override.so" },
    extraArgs: ["runtime"],
  },
}
const profile: ProfileRecord = {
  id: "handheld",
  gamescope: {
    extraArgs: ["profile"],
    app: { environment: { WAYLAND_DISPLAY: null } },
  },
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
  source: "roms",
  gamescope: { extraArgs: ["item"] },
  moonlight: { extraArgs: ["item"] },
  releases: [
    {
      id: "genesis",
      system: "genesis",
      target: "genesis/Sonic.md",
      gamescope: { extraArgs: ["release"] },
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
  source: "roms",
  releases: [
    { id: "genesis", system: "genesis", target: "genesis/Sonic.md" },
    { id: "steam", system: "windows", target: "steam://rungameid/71113" },
  ],
}
const gbaPackage: LibraryItemRecord = {
  id: "super-mario-advance-2",
  source: "roms",
  contains: {
    "super-mario-world": {
      title: "Super Mario World",
      gamescope: { extraArgs: ["contained"] },
    },
  },
  releases: [{ id: "gba", system: "genesis", target: "gba/sma2.gba" }],
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

describe("resolveReadableLaunchContext", () => {
  it("resolves source, app, runtime, file content, and cascade order", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(snapshot(), {
        playableId: "sonic-the-hedgehog",
        userId: "simon",
        profileId: "handheld",
        override: {
          env: { SCALE: "override" },
          gamescope: {
            extraArgs: ["override"],
            environment: { OUTER_UNSET: null },
          },
          moonlight: { stream: { fps: 30 } },
        },
      }),
    )

    expect(context.playableId).toBe("sonic-the-hedgehog")
    expect(context.releaseId).toBe("genesis")
    expect(context.sourceId).toBe("roms")
    expect(context.app.id).toBe("retroarch")
    expect(context.runtime?.path).toBe("/cores/genesis_plus_gx.so")
    expect(context.target).toBe("genesis/Sonic.md")
    expect(context.content?.path).toBe("/games/genesis/Sonic.md")
    expect(context.gamescope?.enable).toBe(true)
    expect(context.gamescope?.environment).toEqual({
      OUTER_ONLY: "host",
      OUTER_UNSET: null,
    })
    expect(context.gamescope?.app?.environment).toEqual({
      WAYLAND_DISPLAY: null,
    })
    expect(context.gamescope?.display).toEqual({
      output: { width: 640, height: 480 },
      nested: { width: 320, height: 240 },
    })
    expect(context.gamescope?.backend).toEqual({
      type: "wayland",
      allowDeferred: true,
    })
    expect(context.gamescope?.scaling?.filter).toBe("fsr")
    expect(context.gamescope?.extraArgs).toEqual([
      "host",
      "user",
      "system",
      "source",
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
        "source",
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
      extraArgs: [
        "host",
        "system",
        "source",
        "app",
        "runtime",
        "release",
        "profile",
      ],
    })
    expect(context.env?.SCALE).toBe("override")
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

  it("normalizes extraArgs-only Gamescope policies to enabled defaults", async () => {
    const context = await Effect.runPromise(
      resolveReadableLaunchContext(
        {
          ...snapshot(),
          host: null,
          users: new Map(),
          systems: new Map([["genesis", { id: "genesis", title: "Genesis" }]]),
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
          apps: new Map([["retroarch", { ...app, gamescope: undefined }]]),
          runtimes: new Map(),
          profiles: new Map([
            [
              "extra-args-only",
              {
                id: "extra-args-only",
                gamescope: { extraArgs: ["--fps-limit", "60"] },
              },
            ],
          ]),
        },
        { playableId: "sonic-the-hedgehog", profileId: "extra-args-only" },
      ),
    )

    expect(context.gamescope?.enable).toBe(true)
    expect(context.gamescope?.backend).toEqual({ type: "wayland" })
    expect(context.gamescope?.extraArgs).toEqual([
      "item",
      "release",
      "--fps-limit",
      "60",
    ])
  })

  it("lets profile and UI override replace resolved app and runtime", async () => {
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
          profiles: new Map([
            ["handheld", { ...profile, app: "steam", runtime: "proton" }],
          ]),
        },
        {
          playableId: "sonic-the-hedgehog",
          profileId: "handheld",
          override: { app: "retroarch", runtime: "genesis-plus-gx" },
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
    expect(context.gamescope?.extraArgs).toContain("contained")
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
            { id: "genesis", system: "genesis", target: "genesis/Sonic.md" },
          ],
        }),
        { playableId: "sonic-the-hedgehog", releaseId: "known" },
      ),
    )

    expect(exit._tag).toBe("Failure")
    expect(String(exit)).toContain("ReleaseNotLaunchable")
  })
})
