import { describe, expect, it } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Cause, Effect } from "effect"

import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_PLUGIN_ID,
} from "@product/plugins/retroarch"
import { resolveAppDescriptor } from "./app-integrations"
import { resolveModuleSelection } from "./module-resolution"
import type { ModuleRecord } from "./records/module"

const run = <A, E>(eff: Effect.Effect<A, E>) => Effect.runSync(eff)
const runPromise = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff)
const runErrTag = async <A, E>(eff: Effect.Effect<A, E>) => {
  const exit = await Effect.runPromiseExit(eff)
  if (exit._tag !== "Failure") return undefined
  const result = Cause.findError(exit.cause) as
    | { success?: { _tag?: string } }
    | undefined
  return result?.success?._tag
}

const retroarch = () =>
  run(
    resolveAppDescriptor({
      appId: KORRI_RETROARCH_APP_ID,
      apps: new Map([
        [
          KORRI_RETROARCH_APP_ID,
          {
            id: KORRI_RETROARCH_APP_ID,
            kind: KORRI_RETROARCH_PLUGIN_ID,
            command: "retroarch",
          },
        ],
      ]),
      launchers: new Map(),
    }),
  )

const moduleRecord = (path: string): ModuleRecord => ({
  id: "fake08",
  kind: "libretro-core",
  path,
})

describe("resolveModuleSelection", () => {
  it("resolves a module id to its stable path", async () => {
    const resolved = await runPromise(
      resolveModuleSelection({
        app: retroarch(),
        modules: new Map([
          ["fake08", moduleRecord("/etc/korri/cores/fake08_libretro.so")],
        ]),
        moduleId: "fake08",
        explicitLaunchModule: true,
      }),
    )

    expect(resolved.modulePath).toBe("/etc/korri/cores/fake08_libretro.so")
  })

  it("allows legacy core strings when no module record exists", async () => {
    const resolved = await runPromise(
      resolveModuleSelection({
        app: retroarch(),
        modules: new Map(),
        moduleId: "snes9x_libretro.so",
        explicitLaunchModule: false,
      }),
    )

    expect(resolved.legacyCore).toBe("snes9x_libretro.so")
  })

  it("fails an explicit launch.module that has no module record", async () => {
    expect(
      await runErrTag(
        resolveModuleSelection({
          app: retroarch(),
          modules: new Map(),
          moduleId: "missing",
          explicitLaunchModule: true,
        }),
      ),
    ).toBe("ModuleNotFound")
  })

  it("can check module path existence before spawn", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-module-resolution-"))
    try {
      const path = join(root, "fake08_libretro.so")
      await writeFile(path, "core")
      const resolved = await runPromise(
        resolveModuleSelection({
          app: retroarch(),
          modules: new Map([["fake08", moduleRecord(path)]]),
          moduleId: "fake08",
          explicitLaunchModule: true,
          checkPathExists: true,
        }),
      )
      expect(resolved.modulePath).toBe(path)

      expect(
        await runErrTag(
          resolveModuleSelection({
            app: retroarch(),
            modules: new Map([
              ["fake08", moduleRecord(join(root, "missing.so"))],
            ]),
            moduleId: "fake08",
            explicitLaunchModule: true,
            checkPathExists: true,
          }),
        ),
      ).toBe("ModulePathMissing")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
