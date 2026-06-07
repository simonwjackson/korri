import { describe, expect, it } from "bun:test"
import { Effect } from "effect"

import {
  type ReadableConfigSnapshot,
  resolveReadableLaunchContext,
} from "./cascade-resolver"
import { composeReadableLaunchSpec } from "./compose-launch-spec"
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
  gamescope: { enabled: true, args: ["host"] },
}
const user: UserRecord = {
  id: "simon",
  gamescope: { args: ["user"] },
}
const system: SystemRecord = {
  id: "genesis",
  gamescope: { args: ["system"] },
}
const source: SourceRecord = {
  id: "roms",
  kind: ["files"],
  storage: "roms",
  app: "retroarch",
  runtime: "genesis-plus-gx",
  gamescope: { args: ["source"] },
}
const app: AppRecord = {
  id: "retroarch",
  command: "retroarch",
  args: ["-L", "{runtime.path}", "{content.path}"],
  systems: ["genesis"],
  gamescope: { args: ["app"] },
}
const runtime: RuntimeRecord = {
  id: "genesis-plus-gx",
  kind: "libretro-core",
  path: "/cores/genesis_plus_gx.so",
  gamescope: { args: ["runtime"] },
}
const profile: ProfileRecord = {
  id: "handheld",
  gamescope: { args: ["profile"] },
  env: { SCALE: "profile" },
}
const storage: StorageRecord = { id: "roms", root: "/games" }
const sonic: LibraryItemRecord = {
  id: "sonic-the-hedgehog",
  source: "roms",
  gamescope: { args: ["item"] },
  releases: [
    {
      id: "genesis",
      system: "genesis",
      target: "genesis/Sonic.md",
      gamescope: { args: ["release"] },
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
      gamescope: { args: ["contained"] },
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
          gamescope: { args: ["override"], forceXwayland: true },
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
    expect(context.gamescope?.enabled).toBe(true)
    expect(context.gamescope?.forceXwayland).toBe(true)
    expect(context.gamescope?.args).toEqual([
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
    const spec = await Effect.runPromise(
      composeReadableLaunchSpec(context.app, context),
    )

    expect(spec.command).toBe("retroarch")
    expect(spec.args).toContain("/cores/genesis_plus_gx.so")
    expect(spec.args).toContain("/games/genesis/Sonic.md")
  })

  it("normalizes args-only Gamescope policies to enabled defaults", async () => {
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
              "args-only",
              { id: "args-only", gamescope: { args: ["--fps-limit", "60"] } },
            ],
          ]),
        },
        { playableId: "sonic-the-hedgehog", profileId: "args-only" },
      ),
    )

    expect(context.gamescope?.enabled).toBe(true)
    expect(context.gamescope?.backend).toBe("wayland")
    expect(context.gamescope?.args).toEqual([
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
    expect(context.gamescope?.args).toContain("contained")
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
