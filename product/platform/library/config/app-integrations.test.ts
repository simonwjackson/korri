import { describe, expect, it } from "bun:test"
import { Cause, Effect } from "effect"

import {
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
