import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { korriDataPath, korriStatePath } from "@platform/config/xdg-paths"
import { Cause, Effect, Exit } from "effect"
import { resolveAppDescriptor } from "./app-integrations"
import {
  cleanupLaunchArtifacts,
  materializeAppLaunch,
  materializeReadableRetroArchLaunch,
  STALE_ARTIFACT_RETENTION_MS,
} from "./app-materializer"
import { cascadeErrorMessage } from "./errors"
import type {
  ReadableResolvedLaunchContext,
  ResolvedLaunchContext,
} from "./resolved-launch-context"

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
  gamescope: {
    enable: true,
    backend: { type: "wayland" },
    window: { exposeWayland: true },
  },
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

async function seedFile(
  root: string,
  relativePath: string,
  content = relativePath,
) {
  const path = join(root, relativePath)
  await mkdir(join(path, ".."), { recursive: true })
  await writeFile(path, content)
  return path
}

const patchedContext = (
  root: string,
  patches: readonly string[],
): ResolvedLaunchContext => ({
  ...context,
  system: "gba",
  contentPath: join(root, "roms", "Super Mario Advance 3.gba"),
  patches,
})

const stableIdentitySuffix = (input: {
  readonly system: string
  readonly contentPath: string
}) => {
  const hash = createHash("sha256")
    .update(`${input.system}\0${input.contentPath}`)
    .digest("hex")
  return `${encodeURIComponent(basename(input.contentPath))}--${hash}`
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

  it("stages RetroArch content and mixed-format patch sidecars as symlinks", async () => {
    await withRoot(async root => {
      const content = await seedFile(root, "roms/Super Mario Advance 3.gba")
      const color = await seedFile(root, "patches/color.IPS")
      const voice = await seedFile(root, "patches/voice.BpS")
      const qol = await seedFile(root, "patches/qol.ups")
      const xdelta = await seedFile(root, "patches/mod.XDelta")

      const result = await runPromise(
        materializeAppLaunch({
          app: app("retroarch"),
          context: patchedContext(root, [color, voice, qol, xdelta]),
          artifactsRoot: join(root, "artifacts"),
        }),
      )

      const stagedContent = result.context.contentPath ?? ""
      expect(stagedContent).toBe(
        join(result.artifacts?.root ?? "", "Super Mario Advance 3.gba"),
      )
      expect(await readlink(stagedContent)).toBe(content)
      expect((await lstat(stagedContent)).isSymbolicLink()).toBe(true)

      await expectPatchSidecars({
        artifactRoot: result.artifacts?.root ?? "",
        paths: result.artifacts?.paths ?? {},
        stagedContent,
        targets: [color, voice, qol, xdelta],
      })
    })
  })

  it("uses XDG cache for patched artifacts and stable data/state roots for progress", async () => {
    await withRoot(async root => {
      const previous = {
        artifacts: process.env.KORRI_LAUNCH_ARTIFACTS_DIR,
        xdgCache: process.env.XDG_CACHE_HOME,
        xdgData: process.env.XDG_DATA_HOME,
        xdgState: process.env.XDG_STATE_HOME,
        home: process.env.HOME,
      }
      delete process.env.KORRI_LAUNCH_ARTIFACTS_DIR
      process.env.XDG_CACHE_HOME = join(root, "cache")
      process.env.XDG_DATA_HOME = join(root, "data")
      process.env.XDG_STATE_HOME = join(root, "state")
      delete process.env.HOME
      try {
        const patch = await seedFile(root, "patches/color.ips")
        await seedFile(root, "roms/Super Mario Advance 3.gba")
        const ctx = patchedContext(root, [patch])

        const result = await runPromise(
          materializeAppLaunch({ app: app("retroarch"), context: ctx }),
        )

        expect(result.artifacts?.root).toStartWith(
          join(root, "cache", "korri", "launch-artifacts"),
        )
        const stableSuffix = stableIdentitySuffix({
          system: ctx.system,
          contentPath: ctx.contentPath ?? "",
        })
        const saveDir = join(
          korriDataPath(process.env, "retroarch", "v1", "gba"),
          stableSuffix,
        )
        const stateDir = join(
          korriStatePath(process.env, "retroarch", "v1", "gba"),
          stableSuffix,
        )
        const cfg = await readFile(result.context.configPath ?? "", "utf8")
        expect(cfg).toContain(`savefile_directory = ${JSON.stringify(saveDir)}`)
        expect(cfg).toContain(
          `savestate_directory = ${JSON.stringify(stateDir)}`,
        )
      } finally {
        setEnv("KORRI_LAUNCH_ARTIFACTS_DIR", previous.artifacts)
        setEnv("XDG_CACHE_HOME", previous.xdgCache)
        setEnv("XDG_DATA_HOME", previous.xdgData)
        setEnv("XDG_STATE_HOME", previous.xdgState)
        setEnv("HOME", previous.home)
      }
    })
  })

  it("uses config save directories instead of deprecated explicit save flags", async () => {
    await withRoot(async root => {
      const content = await seedFile(root, "roms/Super Mario Advance 3.gba")
      const patch = await seedFile(root, "patches/color.ips")
      const env = {
        XDG_DATA_HOME: join(root, "data"),
        XDG_STATE_HOME: join(root, "state"),
      }

      const result = await runPromise(
        materializeAppLaunch({
          app: app("retroarch"),
          context: {
            ...context,
            system: "gba",
            contentPath: content,
            patches: [patch],
          },
          artifactsRoot: join(root, "artifacts"),
          env,
        }),
      )

      expect(result.context.contentPath).toBe(
        join(result.artifacts?.root ?? "", "Super Mario Advance 3.gba"),
      )
      expect(result.launcher.args).toEqual([
        "--config",
        "{configPath}",
        "-L",
        "{modulePath}",
        "{contentPath}",
      ])
      expect(result.launcher.args).not.toContain("--save")
      expect(result.launcher.args).not.toContain("--savestate")

      const cfg = await readFile(result.context.configPath ?? "", "utf8")
      expect(cfg).toContain("savefile_directory = ")
      expect(cfg).toContain("savestate_directory = ")
      expect(cfg).not.toContain("savefile_path")
      expect(cfg).not.toContain("savestate_path")
    })
  })

  it("preserves stable save and state identity across differing patch lists", async () => {
    await withRoot(async root => {
      const content = await seedFile(root, "roms/Super Mario Advance 3.gba")
      const color = await seedFile(root, "patches/color.ips")
      const voice = await seedFile(root, "patches/voice.ips")
      const env = {
        XDG_DATA_HOME: join(root, "data"),
        XDG_STATE_HOME: join(root, "state"),
      }

      const first = await runPromise(
        materializeAppLaunch({
          app: app("retroarch"),
          context: {
            ...context,
            system: "gba",
            contentPath: content,
            patches: [color],
          },
          artifactsRoot: join(root, "artifacts"),
          env,
        }),
      )
      const second = await runPromise(
        materializeAppLaunch({
          app: app("retroarch"),
          context: {
            ...context,
            system: "gba",
            contentPath: content,
            patches: [color, voice],
          },
          artifactsRoot: join(root, "artifacts"),
          env,
        }),
      )

      const saveLine = /savefile_directory = .*/
      const firstCfg = await readFile(first.context.configPath ?? "", "utf8")
      const secondCfg = await readFile(second.context.configPath ?? "", "utf8")
      expect(firstCfg.match(saveLine)?.[0]).toBe(secondCfg.match(saveLine)?.[0])
    })
  })

  it("rejects unsupported patch declarations before creating a launch artifact", async () => {
    await withRoot(async root => {
      const content = await seedFile(root, "roms/Super Mario Advance 3.gba")
      const unsupported = await seedFile(root, "patches/hack.ppf")
      const artifactsRoot = join(root, "artifacts")

      const exit = await Effect.runPromiseExit(
        materializeAppLaunch({
          app: app("retroarch"),
          context: { ...context, contentPath: content, patches: [unsupported] },
          artifactsRoot,
        }),
      )

      expect(exitFailureMessage(exit)).toContain(
        "unsupported patch extension .ppf",
      )
      expect(await readdir(artifactsRoot)).toEqual([])
    })
  })

  it("rejects missing patch files before creating a launch artifact", async () => {
    await withRoot(async root => {
      await seedFile(root, "roms/Super Mario Advance 3.gba")
      const artifactsRoot = join(root, "artifacts")
      const missing = join(root, "patches", "missing.ips")

      const exit = await Effect.runPromiseExit(
        materializeAppLaunch({
          app: app("retroarch"),
          context: patchedContext(root, [missing]),
          artifactsRoot,
        }),
      )

      expect(exitFailureMessage(exit)).toBe(`patch file not found: ${missing}`)
      expect(await readdir(artifactsRoot)).toEqual([])
    })
  })

  it("accepts symlinked patch files but rejects patches on non-RetroArch apps", async () => {
    await withRoot(async root => {
      await seedFile(root, "roms/Super Mario Advance 3.gba")
      const target = await seedFile(root, "patches/target.ips")
      const linked = join(root, "patches", "linked.IPS")
      await symlink(target, linked)

      const staged = await runPromise(
        materializeAppLaunch({
          app: app("retroarch"),
          context: patchedContext(root, [linked]),
          artifactsRoot: join(root, "artifacts"),
        }),
      )
      expect(await readlink(staged.artifacts?.paths.patch0 ?? "")).toBe(linked)

      const exit = await Effect.runPromiseExit(
        materializeAppLaunch({
          app: app("dolphin"),
          context: {
            ...patchedContext(root, [linked]),
            launcherId: "dolphin",
            appId: "dolphin",
          },
          artifactsRoot: join(root, "artifacts"),
        }),
      )
      expect(exitFailureMessage(exit)).toBe(
        "patches are not supported for app dolphin (dolphin)",
      )
    })
  })
})

describe("materializeReadableRetroArchLaunch", () => {
  const readableContext: ReadableResolvedLaunchContext = {
    playableId: "sonic-the-hedgehog",
    itemId: "sonic-the-hedgehog",
    releaseId: "genesis",
    system: "genesis",
    sourceId: "roms",
    target: "genesis/Sonic.md",
    app: {
      id: "retroarch",
      kind: "retroarch",
      command: "retroarch",
      configFile: { mode: "generated" },
      video: { fullscreen: true },
    },
    runtime: {
      id: "genesis-plus-gx",
      kind: "libretro-core",
      path: "/cores/genesis_plus_gx.so",
    },
    content: { path: "/games/genesis/Sonic.md" },
    gamescope: { enable: false },
    retroarch: {
      configFile: { mode: "generated" },
      video: { fullscreen: true },
    },
  }

  it("writes a generated config and typed RetroArch argv", async () => {
    await withRoot(async root => {
      const result = await runPromise(
        materializeReadableRetroArchLaunch({
          context: readableContext,
          artifactsRoot: root,
        }),
      )

      const configPath = result.artifacts?.paths.configPath
      if (configPath === undefined) throw new Error("missing config artifact")
      expect(result.spec.args).toEqual([
        "-c",
        configPath,
        "-L",
        "/cores/genesis_plus_gx.so",
        "/games/genesis/Sonic.md",
      ])
      const config = await readFile(configPath, "utf8")
      expect(config).toContain('config_save_on_exit = "false"')
      expect(config).toContain('video_fullscreen = "true"')
    })
  })

  it("resolves relative RetroArch log files under launch artifact logs", async () => {
    await withRoot(async root => {
      const result = await runPromise(
        materializeReadableRetroArchLaunch({
          context: {
            ...readableContext,
            retroarch: {
              ...readableContext.retroarch,
              logging: { verbose: true, logFile: "retroarch.log" },
            },
          },
          artifactsRoot: root,
        }),
      )

      expect(result.spec.args).toContain(
        `--log-file=${join(result.artifacts?.root ?? "", "logs", "retroarch.log")}`,
      )
      expect(await readdir(join(result.artifacts?.root ?? "", "logs"))).toEqual(
        [],
      )
    })
  })

  it("uses explicit RetroArch content.path overrides instead of release content", async () => {
    await withRoot(async root => {
      const result = await runPromise(
        materializeReadableRetroArchLaunch({
          context: {
            ...readableContext,
            retroarch: {
              ...readableContext.retroarch,
              content: { path: "/override/Sonic.md" },
            },
          },
          artifactsRoot: root,
        }),
      )

      expect(result.spec.args.at(-1)).toBe("/override/Sonic.md")
    })
  })

  it("does not let patch stable defaults override typed path fields", async () => {
    await withRoot(async root => {
      const content = await seedFile(root, "roms/Sonic.md")
      const patch = await seedFile(root, "patches/fix.ips")
      const result = await runPromise(
        materializeReadableRetroArchLaunch({
          context: {
            ...readableContext,
            content: { path: content },
            patches: [patch],
            retroarch: {
              ...readableContext.retroarch,
              paths: {
                systemDirectory: "/operator/system",
                savefileDirectory: "/operator/saves",
                savestateDirectory: "/operator/states",
                screenshotDirectory: "/operator/screenshots",
                cacheDirectory: "/operator/cache",
              },
            },
          },
          artifactsRoot: join(root, "artifacts"),
          env: {
            XDG_DATA_HOME: join(root, "data"),
            XDG_STATE_HOME: join(root, "state"),
          },
        }),
      )

      const configPath = result.artifacts?.paths.configPath
      if (configPath === undefined) throw new Error("missing config artifact")
      const config = await readFile(configPath, "utf8")
      expect(config).toContain('system_directory = "/operator/system"')
      expect(config).toContain('savefile_directory = "/operator/saves"')
      expect(config).toContain('savestate_directory = "/operator/states"')
      expect(config).toContain('screenshot_directory = "/operator/screenshots"')
      expect(config).toContain('cache_directory = "/operator/cache"')
      expect(config).not.toContain("Sonic.md--")
    })
  })

  it("fails before rendering when no content path is resolved", async () => {
    const exit = await Effect.runPromiseExit(
      materializeReadableRetroArchLaunch({
        context: {
          ...readableContext,
          content: undefined,
          retroarch: { configFile: { mode: "generated" } },
        },
        artifactsRoot: "/tmp/unused",
      }),
    )

    expect(exitFailureMessage(exit)).toContain("AppMaterializationFailed")
  })

  it("rejects non-RetroArch apps at the materializer boundary", async () => {
    const exit = await Effect.runPromiseExit(
      materializeReadableRetroArchLaunch({
        context: {
          ...readableContext,
          app: { id: "steam", command: "steam", args: ["{target}"] },
        },
        artifactsRoot: "/tmp/unused",
      }),
    )

    expect(exitFailureMessage(exit)).toContain("AppMaterializationFailed")
  })
})

async function expectPatchSidecars(input: {
  readonly artifactRoot: string
  readonly paths: Readonly<Record<string, string>>
  readonly stagedContent: string
  readonly targets: readonly string[]
}): Promise<void> {
  const sidecars = [
    join(input.artifactRoot, "Super Mario Advance 3.ips"),
    join(input.artifactRoot, "Super Mario Advance 3.bps1"),
    join(input.artifactRoot, "Super Mario Advance 3.ups2"),
    join(input.artifactRoot, "Super Mario Advance 3.xdelta3"),
  ]
  for (const [index, sidecar] of sidecars.entries()) {
    expect((await lstat(sidecar)).isSymbolicLink()).toBe(true)
    expect(await readlink(sidecar)).toBe(input.targets[index])
    expect(input.paths[`patch${index}`]).toBe(sidecar)
  }
  expect(input.paths.contentPath).toBe(input.stagedContent)
}

function exitFailureMessage<A, E>(exit: Exit.Exit<A, E>): string {
  if (Exit.isSuccess(exit)) throw new Error("expected failure")
  return cascadeErrorMessage(Cause.squash(exit.cause))
}

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}
