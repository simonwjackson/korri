import { describe, expect, it } from "bun:test"
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"

import { resolveAppDescriptor } from "./app-integrations"
import {
  cleanupLaunchArtifacts,
  materializeAppLaunch,
  STALE_ARTIFACT_RETENTION_MS,
} from "./app-materializer"
import type { ResolvedLaunchContext } from "./resolved-launch-context"

const runPromise = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff)
const app = (id: string) =>
  Effect.runSync(
    resolveAppDescriptor({
      appId: id,
      apps: new Map(),
      launchers: new Map(),
    }),
  )

const context: ResolvedLaunchContext = {
  gameId: "porklike",
  launcherId: "retroarch",
  appId: "retroarch",
  system: "pico8",
  contentPath: "/storage/roms/pico8/porklike.p8",
  moduleId: "fake08",
  modulePath: "/etc/korri/cores/fake08_libretro.so",
  core: "/etc/korri/cores/fake08_libretro.so",
  gamescope: { enabled: true, backend: "wayland", exposeWayland: true },
  settings: { video_scale_integer: true, config_save_on_exit: false },
}

async function withRoot<T>(fn: (root: string) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), "korri-app-materializer-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("materializeAppLaunch", () => {
  it("fails before writing artifacts when no shared artifact root is configured", async () => {
    const previous = process.env.KORRI_LAUNCH_ARTIFACTS_DIR
    delete process.env.KORRI_LAUNCH_ARTIFACTS_DIR
    try {
      const exit = await Effect.runPromiseExit(
        materializeAppLaunch({ app: app("retroarch"), context }),
      )
      expect(exit._tag).toBe("Failure")
    } finally {
      if (previous !== undefined) {
        process.env.KORRI_LAUNCH_ARTIFACTS_DIR = previous
      }
    }
  })

  it("materializes RetroArch settings and references config/module paths", async () => {
    await withRoot(async root => {
      const result = await runPromise(
        materializeAppLaunch({
          app: app("retroarch"),
          context,
          artifactsRoot: root,
        }),
      )

      expect(result.context.configPath).toBe(result.artifacts?.paths.configPath)
      expect(result.context.modulePath).toBe(
        "/etc/korri/cores/fake08_libretro.so",
      )
      expect(result.launcher.args).toEqual([
        "--config",
        "{configPath}",
        "-L",
        "{modulePath}",
        "{contentPath}",
      ])
      const cfg = await readFile(result.context.configPath ?? "", "utf8")
      expect(cfg).toContain('video_scale_integer = "true"')
      expect(cfg).toContain('config_save_on_exit = "false"')
    })
  })

  it("sanitizes slash-bearing game ids into a single artifact directory name", async () => {
    await withRoot(async root => {
      const result = await runPromise(
        materializeAppLaunch({
          app: app("retroarch"),
          context: { ...context, gameId: "pico8/porklike.p8" },
          artifactsRoot: root,
        }),
      )
      expect(result.artifacts?.root).toContain("pico8-porklike.p8-")
    })
  })

  it("materializes MAME and Dolphin isolated config roots", async () => {
    await withRoot(async root => {
      const mame = await runPromise(
        materializeAppLaunch({
          app: app("mame"),
          context: {
            ...context,
            launcherId: "mame",
            appId: "mame",
            moduleId: undefined,
            modulePath: undefined,
            core: undefined,
          },
          artifactsRoot: root,
        }),
      )
      expect(mame.context.configDir).toContain("mame")

      const dolphin = await runPromise(
        materializeAppLaunch({
          app: app("dolphin"),
          context: {
            ...context,
            launcherId: "dolphin",
            appId: "dolphin",
            moduleId: undefined,
            modulePath: undefined,
            core: undefined,
          },
          artifactsRoot: root,
        }),
      )
      expect(dolphin.context.userDir).toContain("dolphin-user")
    })
  })

  it("materializes Solarus state isolation even though its argv is direct", async () => {
    await withRoot(async root => {
      const result = await runPromise(
        materializeAppLaunch({
          app: app("solarus"),
          context: {
            ...context,
            launcherId: "solarus",
            appId: "solarus",
            moduleId: undefined,
            modulePath: undefined,
            core: undefined,
          },
          artifactsRoot: root,
        }),
      )

      expect(result.context.env?.XDG_STATE_HOME).toContain("solarus-state")
    })
  })

  it("produces distinct per-invocation artifact paths", async () => {
    await withRoot(async root => {
      const first = await runPromise(
        materializeAppLaunch({
          app: app("retroarch"),
          context,
          artifactsRoot: root,
        }),
      )
      const second = await runPromise(
        materializeAppLaunch({
          app: app("retroarch"),
          context,
          artifactsRoot: root,
        }),
      )
      expect(first.artifacts?.root).not.toBe(second.artifacts?.root)
    })
  })

  it("cleans rejected-launch artifacts when the caller asks", async () => {
    await withRoot(async root => {
      const result = await runPromise(
        materializeAppLaunch({
          app: app("retroarch"),
          context,
          artifactsRoot: root,
        }),
      )
      await runPromise(cleanupLaunchArtifacts(result.artifacts))
      await expect(
        readFile(result.context.configPath ?? "", "utf8"),
      ).rejects.toThrow()
    })
  })

  it("evicts stale artifact directories on the next launch", async () => {
    await withRoot(async root => {
      const stale = join(root, "stale")
      await mkdir(stale, { recursive: true })
      await writeFile(join(stale, "old.cfg"), "old")
      const staleDate = new Date(
        Date.now() - STALE_ARTIFACT_RETENTION_MS - 10_000,
      )
      await utimes(stale, staleDate, staleDate)

      await runPromise(
        materializeAppLaunch({
          app: app("retroarch"),
          context,
          artifactsRoot: root,
        }),
      )
      await expect(readFile(join(stale, "old.cfg"), "utf8")).rejects.toThrow()
    })
  })
})
