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

const readableLauncherMap = (readableLaunchers: readonly AppRecord[] = []) =>
  new Map(readableLaunchers.map(launcher => [launcher.id, launcher]))
const launcherMap = (launchers: readonly LauncherRecord[] = []) =>
  new Map(launchers.map(launcher => [launcher.id, launcher]))

describe("resolveAppDescriptor", () => {
  it("does not provide Steam as a generic built-in app", () => {
    expect(getBuiltInAppDescriptor("steam")).toBeUndefined()
    expect(
      runErrTag(
        resolveAppDescriptor({
          appId: "steam",
          readableLaunchers: readableLauncherMap(),
          launchers: launcherMap(),
        }),
      ),
    ).toBe("AppNotFound")
  })

  it("does not provide RetroArch as a generic built-in app", () => {
    expect(
      runErrTag(
        resolveAppDescriptor({
          appId: "retroarch",
          readableLaunchers: readableLauncherMap(),
          launchers: launcherMap(),
        }),
      ),
    ).toBe("AppNotFound")
  })

  it("resolves plugin-qualified RetroArch from an authored app record", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "@korri:retroarch/retroarch",
        readableLaunchers: readableLauncherMap([
          {
            id: "@korri:retroarch/retroarch",
            plugin: "@korri:retroarch",
            command: "retroarch",
            args: ["-L", "{runtime.path}", "{content.path}"],
          },
        ]),
        launchers: launcherMap(),
      }),
    )

    expect(app.integration).toBe("@korri:retroarch")
    expect(app.command).toBe("retroarch")
  })

  it("does not extract RetroArch policy from non-RetroArch app records", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "dolphin",
        readableLaunchers: readableLauncherMap([
          {
            id: "dolphin",
            plugin: "dolphin",
            command: "dolphin-emu",
          },
        ]),
        launchers: launcherMap(),
      }),
    )

    expect(app.integration).toBe("dolphin")
    expect("retroarch" in app).toBe(false)
  })

  it("resolves a first-class plugin app app without a built-in command default", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "plugin-app",
        readableLaunchers: readableLauncherMap([
          {
            id: "plugin-app",
            plugin: "plugin-app",
            command: "/bin/Ryujinx",
            settings: {
              plugin: { state: { root: "/state/Ryujinx" } },
            },
          },
        ]),
        launchers: launcherMap(),
      }),
    )

    expect(app.integration).toBe("plugin-app")
    expect(app.command).toBe("/bin/Ryujinx")
  })

  it("resolves a provider-qualified Steam app only from an authored plugin app record", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "@korri:steam/steam",
        readableLaunchers: readableLauncherMap([
          {
            id: "@korri:steam/steam",
            plugin: "@korri:steam",
            command: "steam",
            launch: { with: { "@fixture:frame": { enable: true } } },
            settings: {
              plugin: {
                state: { root: "/steam-home" },
              },
            },
          },
        ]),
        launchers: launcherMap(),
      }),
    )

    expect(app.integration).toBe("@korri:steam")
    expect(app.command).toBe("steam")
    expect(app.launchCompanions).toEqual({
      "@fixture:frame": { enable: true },
    })
  })

  it("resolves a custom process app with an explicit command", () => {
    const app = run(
      resolveAppDescriptor({
        appId: "my-runner",
        readableLaunchers: readableLauncherMap([
          {
            id: "my-runner",
            command: "/usr/bin/my-runner",
            args: ["{content.path}"],
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
          readableLaunchers: readableLauncherMap([{ id: "my-runner", settings: { fullscreen: true } }]),
          launchers: launcherMap(),
        }),
      ),
    ).toBe("CustomAppMissingCommand")
  })

  it("fails a first-class plugin app app without command", () => {
    expect(
      runErrTag(
        resolveAppDescriptor({
          appId: "plugin-app",
          readableLaunchers: readableLauncherMap([{ id: "plugin-app", plugin: "plugin-app" }]),
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
          readableLaunchers: readableLauncherMap(),
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

  it("allows libretro modules for the RetroArch plugin app", () => {
    const retroarch = run(
      resolveAppDescriptor({
        appId: "@korri:retroarch/retroarch",
        readableLaunchers: readableLauncherMap([
          {
            id: "@korri:retroarch/retroarch",
            plugin: "@korri:retroarch",
            command: "retroarch",
          },
        ]),
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
        readableLaunchers: readableLauncherMap(),
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
