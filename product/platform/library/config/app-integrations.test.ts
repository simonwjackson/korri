import { describe, expect, it } from "bun:test"
import { Cause, Effect } from "effect"

import {
  getBuiltInAppDescriptor,
  resolveAppDescriptor,
  validateAppModuleCompatibility,
} from "./app-integrations"
import type { AppRecord } from "./records/app"
import type { LauncherRecord } from "./records/launcher"
import type { ModuleRecord } from "./records/module"

const run = <A, E>(eff: Effect.Effect<A, E>) => Effect.runSync(eff)
const runErrTag = <A, E>(eff: Effect.Effect<A, E>): string | undefined => {
  const exit = Effect.runSyncExit(eff)
  if (exit._tag !== "Failure") return undefined
  const result = Cause.findError(exit.cause) as
    | { success?: { _tag?: string } }
    | undefined
  return result?.success?._tag
}

const appMap = (apps: readonly AppRecord[] = []) =>
  new Map(apps.map(app => [app.id, app]))
const launcherMap = (launchers: readonly LauncherRecord[] = []) =>
  new Map(launchers.map(launcher => [launcher.id, launcher]))

describe("resolveAppDescriptor", () => {
  it("declares Steam as a baseline-defaults built-in integration", () => {
    expect(getBuiltInAppDescriptor("steam")?.capabilities).toEqual({
      baselineDefaults: true,
    })
  })

  it("resolves built-in retroarch without an apps YAML record", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "retroarch",
        apps: appMap(),
        launchers: launcherMap(),
      }),
    )

    expect(app.integration).toBe("retroarch")
    expect(app.command).toBe("retroarch")
    expect(app.args).toContain("{modulePath}")
  })

  it("merges apps.retroarch.settings while preserving built-in integration", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "retroarch",
        apps: appMap([
          {
            id: "retroarch",
            settings: { video_driver: "glcore" },
          },
        ]),
        launchers: launcherMap(),
      }),
    )

    expect(app.integration).toBe("retroarch")
    expect(app.settings).toMatchObject({
      config_save_on_exit: false,
      video_driver: "glcore",
    })
  })

  it("does not extract RetroArch policy from non-RetroArch app records", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "dolphin",
        apps: appMap([
          {
            id: "dolphin",
            kind: "dolphin",
            video: { fullscreen: true },
          },
        ]),
        launchers: launcherMap(),
      }),
    )

    expect(app.integration).toBe("dolphin")
    expect(app.retroarch).toBeUndefined()
  })

  it("preserves legacy launcher RetroArch policy when app override has no RetroArch fields", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "retroarch",
        apps: appMap([{ id: "retroarch", command: "retroarch" }]),
        launchers: launcherMap([
          {
            id: "retroarch",
            command: "retroarch",
            args: ["{contentPath}"],
            systems: ["snes"],
            retroarch: { video: { fullscreen: false } },
          },
        ]),
      }),
    )

    expect(app.retroarch?.video?.fullscreen).toBe(false)
  })

  it("resolves a first-class Ryubing app without a built-in command default", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "ryubing",
        apps: appMap([
          {
            id: "ryubing",
            kind: "ryubing",
            command: "/bin/Ryujinx",
            state: { root: "/state/Ryujinx" },
          },
        ]),
        launchers: launcherMap(),
      }),
    )

    expect(app.integration).toBe("ryubing")
    expect(app.command).toBe("/bin/Ryujinx")
    expect(app.ryubing?.state?.root).toBe("/state/Ryujinx")
  })

  it("resolves an active first-class Steam app from the built-in baseline", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "steam",
        apps: appMap([
          {
            id: "steam",
            kind: "steam",
            state: { root: "/steam-home" },
          },
        ]),
        launchers: launcherMap(),
      }),
    )

    expect(app.integration).toBe("steam")
    expect(app.command).toBe("steam")
    expect(app.args).toEqual([])
    expect(app.gamescope).toEqual({
      enable: true,
    })
    expect(app.capabilities).toEqual({ baselineDefaults: true })
  })

  it("merges partial app-scoped Steam Gamescope tuning with the built-in baseline", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "steam",
        apps: appMap([
          {
            id: "steam",
            kind: "steam",
            launch: {
              with: {
                "@korri:gamescope": {
                  display: { nested: { width: 854, height: 480 } },
                },
              },
            },
            state: { root: "/steam-home" },
          },
        ]),
        launchers: launcherMap(),
      }),
    )

    expect(app.gamescope).toEqual({
      enable: true,
      display: { nested: { width: 854, height: 480 } },
    })
  })

  it("lets app-scoped Steam overrides replace the built-in baseline", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "steam",
        apps: appMap([
          {
            id: "steam",
            kind: "steam",
            command: "/usr/bin/steam-custom",
            launch: { with: { "@korri:gamescope": { enable: false } } },
            state: { root: "/steam-home" },
          },
        ]),
        launchers: launcherMap(),
      }),
    )

    expect(app.integration).toBe("steam")
    expect(app.command).toBe("/usr/bin/steam-custom")
    expect(app.gamescope).toEqual({ enable: false })
  })

  it("does not inherit legacy Steam Gamescope fields once app-scoped config exists", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "steam",
        apps: appMap([
          {
            id: "steam",
            kind: "steam",
            launch: {
              with: {
                "@korri:gamescope": {
                  display: { nested: { width: 854, height: 480 } },
                },
              },
            },
            state: { root: "/steam-home" },
          },
        ]),
        launchers: launcherMap([
          {
            id: "steam",
            command: "steam",
            args: [],
            systems: [],
            launch: { with: { "@korri:gamescope": { enable: false } } },
          },
        ]),
      }),
    )

    expect(app.gamescope).toEqual({
      enable: true,
      display: { nested: { width: 854, height: 480 } },
    })
  })

  it("merges legacy Steam launcher Gamescope tuning with the built-in baseline", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "steam",
        apps: appMap(),
        launchers: launcherMap([
          {
            id: "steam",
            command: "steam",
            args: [],
            systems: [],
            launch: {
              with: {
                "@korri:gamescope": {
                  display: { nested: { width: 854, height: 480 } },
                },
              },
            },
          },
        ]),
      }),
    )

    expect(app.gamescope).toEqual({
      enable: true,
      display: { nested: { width: 854, height: 480 } },
    })
  })

  it("does not activate Steam without an apps.steam record", () => {
    expect(
      runErrTag(
        resolveAppDescriptor({
          appId: "steam",
          apps: appMap(),
          launchers: launcherMap(),
        }),
      ),
    ).toBe("AppNotFound")
  })

  it("resolves a custom process app with an explicit command", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "my-runner",
        apps: appMap([
          {
            id: "my-runner",
            command: "/usr/bin/my-runner",
            args: ["{contentPath}"],
          },
        ]),
        launchers: launcherMap(),
      }),
    )

    expect(app.integration).toBe("generic-process")
    expect(app.command).toBe("/usr/bin/my-runner")
  })

  it("fails a custom app without command", () => {
    expect(
      runErrTag(
        resolveAppDescriptor({
          appId: "my-runner",
          apps: appMap([{ id: "my-runner", settings: { fullscreen: true } }]),
          launchers: launcherMap(),
        }),
      ),
    ).toBe("CustomAppMissingCommand")
  })

  it("fails a first-class Ryubing app without command", () => {
    expect(
      runErrTag(
        resolveAppDescriptor({
          appId: "ryubing",
          apps: appMap([{ id: "ryubing", kind: "ryubing" }]),
          launchers: launcherMap(),
        }),
      ),
    ).toBe("CustomAppMissingCommand")
  })

  it("fails an unknown app id", () => {
    expect(
      runErrTag(
        resolveAppDescriptor({
          appId: "missing",
          apps: appMap(),
          launchers: launcherMap(),
        }),
      ),
    ).toBe("AppNotFound")
  })
})

describe("validateAppModuleCompatibility", () => {
  const fake08: ModuleRecord = {
    id: "fake08",
    kind: "libretro-core",
    path: "/etc/korri/cores/fake08_libretro.so",
  }

  it("allows libretro modules for RetroArch", () => {
    const retroarch = run(
      resolveAppDescriptor({
        appId: "retroarch",
        apps: appMap(),
        launchers: launcherMap(),
      }),
    )
    expect(
      run(validateAppModuleCompatibility({ app: retroarch, module: fake08 })),
    ).toBeUndefined()
  })

  it("rejects modules for direct apps such as Dolphin", () => {
    const dolphin = run(
      resolveAppDescriptor({
        appId: "dolphin",
        apps: appMap(),
        launchers: launcherMap(),
      }),
    )
    expect(
      runErrTag(
        validateAppModuleCompatibility({ app: dolphin, module: fake08 }),
      ),
    ).toBe("IncompatibleModule")
  })
})
