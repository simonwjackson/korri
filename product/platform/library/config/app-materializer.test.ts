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
import { RYUBING_CONFIG_VERSION } from "@platform/stream/ryubing-launch-spec"
import { Cause, Effect, Exit } from "effect"
import { resolveAppDescriptor } from "./app-integrations"
import {
  cleanupLaunchArtifacts,
  materializeAppLaunch,
  materializeReadableRetroArchLaunch,
  materializeReadableRyubingLaunch,
  materializeReadableSteamLaunch,
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
  launchCompanions: {
    "@example:wrapper": {
      enable: true,
      backend: { type: "wayland" },
      window: { exposeWayland: true },
    },
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
    launchCompanions: { "@example:wrapper": { enable: false } },
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

  it("materializes expanded policy into one cfg, one core arg, and final content path", async () => {
    await withRoot(async root => {
      const result = await runPromise(
        materializeReadableRetroArchLaunch({
          context: {
            ...readableContext,
            retroarch: {
              configFile: { mode: "generated" },
              core: { path: "/cores/genesis_plus_gx.so" },
              content: { path: "/games/genesis/Sonic.md" },
              drivers: { video: "glcore", menu: "ozone" },
              paths: { cacheDirectory: "/operator/cache" },
              video: {
                fullscreen: true,
                aspectRatio: "full",
                sync: { frameDelay: 0, frameDelayAuto: false },
              },
              audio: { outputRate: 48000, latencyMs: 64 },
              input: {
                menuToggleGamepadCombo: "start-select",
                ports: { "1": { libretroDevice: 1, joypadIndex: 0 } },
              },
              menu: { showStartScreen: false },
              saves: { autosaveIntervalSeconds: 60 },
              rewind: { enable: true, bufferSizeMb: 20 },
              latency: { runAhead: { enable: false, frames: 0 } },
              achievements: { enable: false },
              extraSettings: { notification_show_autoconfig: false },
            },
          },
          artifactsRoot: root,
        }),
      )

      const configPath = result.artifacts?.paths.configPath
      if (configPath === undefined) throw new Error("missing config artifact")
      expect(result.spec.args.filter(arg => arg === "-c")).toHaveLength(1)
      expect(result.spec.args.filter(arg => arg === "-L")).toHaveLength(1)
      expect(result.spec.args).toEqual([
        "-c",
        configPath,
        "-L",
        "/cores/genesis_plus_gx.so",
        "/games/genesis/Sonic.md",
      ])
      expect(result.spec.args.at(-1)).toBe("/games/genesis/Sonic.md")

      const config = await readFile(configPath, "utf8")
      expect(config).toContain('config_save_on_exit = "false"')
      expect(config).toContain('auto_overrides_enable = "false"')
      expect(config).toContain('menu_driver = "ozone"')
      expect(config).toContain('cache_directory = "/operator/cache"')
      expect(config).toContain("aspect_ratio_index = 24")
      expect(config).toContain("video_frame_delay = 0")
      expect(config).toContain("audio_out_rate = 48000")
      expect(config).toContain("input_menu_toggle_gamepad_combo = 4")
      expect(config).toContain("input_libretro_device_p1 = 1")
      expect(config).toContain("rewind_buffer_size = 20")
      expect(config).toContain('notification_show_autoconfig = "false"')
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

  it("fails clearly when no core path is resolved", async () => {
    await withRoot(async root => {
      const exit = await Effect.runPromiseExit(
        materializeReadableRetroArchLaunch({
          context: {
            ...readableContext,
            runtime: undefined,
            retroarch: { configFile: { mode: "generated" } },
          },
          artifactsRoot: root,
        }),
      )

      expect(exitFailureMessage(exit)).toContain("core path")
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

    expect(exitFailureMessage(exit)).toContain("resolved content path")
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

    expect(exitFailureMessage(exit)).toContain("requires kind: retroarch")
  })
})

describe("materializeReadableRyubingLaunch", () => {
  const ryubingContext = (root: string): ReadableResolvedLaunchContext => ({
    playableId: "mario-kart-8-deluxe",
    itemId: "mario-kart-8-deluxe",
    releaseId: "switch",
    system: "switch",
    sourceId: "switch-card",
    target: join(root, "roms/switch/Mario Kart 8 Deluxe.nsp"),
    content: { path: join(root, "roms/switch/Mario Kart 8 Deluxe.nsp") },
    storage: { "switch-card": { id: "switch-card", root } },
    app: {
      id: "ryubing",
      kind: "ryubing",
      command: "/bin/Ryujinx",
      state: {
        root: "{storage:switch-card}/.config/Ryujinx",
        create: true,
        require: { keys: ["prod.keys"] },
      },
    },
    launchCompanions: { "@example:wrapper": { enable: false } },
    ryubing: {
      state: {
        root: "{storage:switch-card}/.config/Ryujinx",
        create: true,
        require: { keys: ["prod.keys"] },
      },
      env: { XDG_CONFIG_HOME: "{storage:switch-card}/.config" },
      display: { fullscreen: true },
      input: {
        "require-config": true,
        controllers: [{ id: "0", mapping: { a: "button-east" } }],
      },
    },
  })

  it("creates persistent state, writes Config.json, and returns no cleanup artifact", async () => {
    await withRoot(async root => {
      await seedFile(root, ".config/Ryujinx/system/prod.keys", "keys")
      await seedFile(root, "roms/switch/Mario Kart 8 Deluxe.nsp", "game")

      const result = await runPromise(
        materializeReadableRyubingLaunch({ context: ryubingContext(root) }),
      )

      const stateRoot = join(root, ".config/Ryujinx")
      expect(result.artifacts).toBeUndefined()
      expect(await readdir(stateRoot)).toEqual(
        expect.arrayContaining([
          "system",
          "bis",
          "sdcard",
          "games",
          "profiles",
          "Logs",
          "Config.json",
        ]),
      )
      expect(result.spec.args.slice(0, 5)).toEqual([
        "--no-gui",
        "--root-data-dir",
        stateRoot,
        "--use-main-config",
        "--fullscreen",
      ])
      expect(result.spec.args.at(-1)).toBe(
        join(root, "roms/switch/Mario Kart 8 Deluxe.nsp"),
      )
      expect(result.spec.env?.XDG_CONFIG_HOME).toBe(join(root, ".config"))
      const config = JSON.parse(
        await readFile(join(stateRoot, "Config.json"), "utf8"),
      )
      expect(config.version).toBe(RYUBING_CONFIG_VERSION)
      expect(config.input_config).toHaveLength(1)
      expect(config.start_fullscreen).toBe(true)
    })
  })

  it("preserves existing Config.json version and unknown keys while reasserting typed fields", async () => {
    await withRoot(async root => {
      await seedFile(root, ".config/Ryujinx/system/prod.keys", "keys")
      await seedFile(
        root,
        ".config/Ryujinx/Config.json",
        JSON.stringify({
          version: 999,
          unknown_future_key: true,
          start_fullscreen: false,
        }),
      )
      await seedFile(root, "roms/switch/Mario Kart 8 Deluxe.nsp", "game")

      await runPromise(
        materializeReadableRyubingLaunch({ context: ryubingContext(root) }),
      )

      const config = JSON.parse(
        await readFile(join(root, ".config/Ryujinx/Config.json"), "utf8"),
      )
      expect(config.version).toBe(999)
      expect(config.unknown_future_key).toBe(true)
      expect(config.start_fullscreen).toBe(true)
    })
  })

  it("fails before creating fake storage roots when media storage token is absent", async () => {
    await withRoot(async root => {
      const missingRoot = join(root, "missing-card")
      const exit = await Effect.runPromiseExit(
        materializeReadableRyubingLaunch({
          context: {
            ...ryubingContext(root),
            storage: {
              "switch-card": { id: "switch-card", root: missingRoot },
            },
          },
        }),
      )

      expect(exitFailureMessage(exit)).toContain("storage switch-card")
      await expect(readdir(missingRoot)).rejects.toThrow()
    })
  })

  it("fails when prod.keys is missing but does not require title.keys by default", async () => {
    await withRoot(async root => {
      await seedFile(root, "roms/switch/Mario Kart 8 Deluxe.nsp", "game")
      const missingProd = await Effect.runPromiseExit(
        materializeReadableRyubingLaunch({ context: ryubingContext(root) }),
      )
      expect(exitFailureMessage(missingProd)).toContain("prod.keys")

      await seedFile(root, ".config/Ryujinx/system/prod.keys", "keys")
      const result = await runPromise(
        materializeReadableRyubingLaunch({ context: ryubingContext(root) }),
      )
      expect(result.spec.command).toBe("/bin/Ryujinx")
    })
  })

  it("rejects non-Ryubing apps at the materializer boundary", async () => {
    const exit = await Effect.runPromiseExit(
      materializeReadableRyubingLaunch({
        context: {
          ...ryubingContext("/tmp/unused"),
          app: { id: "retroarch", kind: "retroarch", command: "retroarch" },
        },
      }),
    )

    expect(exitFailureMessage(exit)).toContain("requires kind: ryubing")
  })

  it("fails before exec when required input config is absent", async () => {
    await withRoot(async root => {
      await seedFile(root, ".config/Ryujinx/system/prod.keys", "keys")
      await seedFile(root, "roms/switch/Mario Kart 8 Deluxe.nsp", "game")
      const exit = await Effect.runPromiseExit(
        materializeReadableRyubingLaunch({
          context: {
            ...ryubingContext(root),
            ryubing: {
              ...ryubingContext(root).ryubing,
              input: { "require-config": true },
            },
          },
        }),
      )

      expect(exitFailureMessage(exit)).toContain("input_config")
    })
  })

  it("allows missing input config only when explicitly not required", async () => {
    await withRoot(async root => {
      await seedFile(root, ".config/Ryujinx/system/prod.keys", "keys")
      await seedFile(root, "roms/switch/Mario Kart 8 Deluxe.nsp", "game")
      const result = await runPromise(
        materializeReadableRyubingLaunch({
          context: {
            ...ryubingContext(root),
            ryubing: {
              ...ryubingContext(root).ryubing,
              input: { "require-config": false },
            },
          },
        }),
      )

      expect(result.spec.command).toBe("/bin/Ryujinx")
    })
  })

  it("fails before creating fake literal run-media state roots", async () => {
    await withRoot(async root => {
      const missingMediaRoot = join(
        root,
        "run/media/korri/storage/fc1f2bfc-b6ea-42ca-8d6b-a1c8aac4f551",
      )
      const stateRoot = join(missingMediaRoot, ".config/Ryujinx")
      const exit = await Effect.runPromiseExit(
        materializeReadableRyubingLaunch({
          context: {
            ...ryubingContext(root),
            storage: {},
            ryubing: {
              ...ryubingContext(root).ryubing,
              state: {
                root: stateRoot,
                create: true,
                require: { keys: ["prod.keys"] },
              },
              env: {},
            },
          },
        }),
      )

      expect(exitFailureMessage(exit)).toContain("no such file or directory")
      await expect(readdir(missingMediaRoot)).rejects.toThrow()
    })
  })

  it("creates literal absolute state roots outside run-media", async () => {
    await withRoot(async root => {
      const stateRoot = join(root, "absolute-state")
      await seedFile(root, "absolute-state/system/prod.keys", "keys")
      await seedFile(root, "roms/switch/Mario Kart 8 Deluxe.nsp", "game")
      const result = await runPromise(
        materializeReadableRyubingLaunch({
          context: {
            ...ryubingContext(root),
            storage: {},
            ryubing: {
              ...ryubingContext(root).ryubing,
              state: {
                root: stateRoot,
                create: true,
                require: { keys: ["prod.keys"] },
              },
              env: {},
            },
          },
        }),
      )

      expect(result.spec.args).toContain(stateRoot)
      expect(result.artifacts).toBeUndefined()
    })
  })

  it("overwrites corrupt Config.json and returns a diagnostic", async () => {
    await withRoot(async root => {
      await seedFile(root, ".config/Ryujinx/system/prod.keys", "keys")
      await seedFile(root, ".config/Ryujinx/Config.json", "{{NOT JSON}}")
      await seedFile(root, "roms/switch/Mario Kart 8 Deluxe.nsp", "game")

      const result = await runPromise(
        materializeReadableRyubingLaunch({ context: ryubingContext(root) }),
      )
      const config = JSON.parse(
        await readFile(join(root, ".config/Ryujinx/Config.json"), "utf8"),
      )

      expect(config.version).toBe(RYUBING_CONFIG_VERSION)
      expect(result.diagnostics?.[0]).toContain("will be regenerated")
    })
  })

  it("fails clearly when no resolved content path is available", async () => {
    await withRoot(async root => {
      await seedFile(root, ".config/Ryujinx/system/prod.keys", "keys")
      const exit = await Effect.runPromiseExit(
        materializeReadableRyubingLaunch({
          context: { ...ryubingContext(root), content: undefined },
        }),
      )

      expect(exitFailureMessage(exit)).toContain("resolved content path")
    })
  })
})

describe("materializeReadableSteamLaunch", () => {
  const steamContext = (stateRoot: string): ReadableResolvedLaunchContext => ({
    playableId: "balatro",
    itemId: "balatro",
    releaseId: "steam",
    system: "steam",
    sourceId: "steam",
    target: "steam://rungameid/2379780",
    app: {
      id: "steam",
      kind: "steam",
      command: "steam",
      state: { root: stateRoot },
    },
    runtime: {
      id: "proton-arm64",
      kind: "tool",
      path: "/compat/proton-arm64",
      tool: "proton-arm64",
    },
    steam: {
      state: { root: stateRoot },
      extra: { args: ["-silent"] },
      "launch-options": "wrapper -- %command%",
    },
  })

  it("materializes Steam desired state and returns the applaunch spec", async () => {
    const events: string[] = []
    const writes: string[] = []
    const files = new Map<string, string>()
    const result = await runPromise(
      materializeReadableSteamLaunch({
        context: steamContext("/steam-home"),
        fs: {
          readText: async path => files.get(path),
          writeTextAtomic: async (path, content) => {
            writes.push(path)
            files.set(path, content)
          },
          mkdirp: async () => {},
        },
        lifecycle: {
          shutdown: async () => {
            events.push("shutdown")
          },
          waitForShutdown: async () => {
            events.push("wait-shutdown")
          },
          start: async input => {
            events.push(`start:${input.args.join(" ")}`)
          },
          waitUntilReady: async () => {
            events.push("ready")
          },
        },
        lock: { withLock: async (_key, run) => run() },
      }),
    )

    expect(result.spec).toEqual({
      command: "steam",
      args: ["-applaunch", "2379780"],
    })
    expect(result.artifacts?.root).toBe("/steam-home")
    expect(writes.length).toBe(2)
    expect(events).toEqual([
      "shutdown",
      "wait-shutdown",
      "start:-silent",
      "ready",
    ])
  })

  it("keeps the Steam wrapper baseline outside per-game LaunchOptions", async () => {
    const writes: Array<{ path: string; content: string }> = []
    const context = steamContext("/steam-home")
    const result = await runPromise(
      materializeReadableSteamLaunch({
        context: {
          ...context,
          launchCompanions: {
            "@example:wrapper": {
              enable: true,
            },
          },
          steam: {
            state: { root: "/steam-home" },
          },
          runtime: undefined,
        },
        fs: {
          readText: async () => undefined,
          writeTextAtomic: async (path, content) => {
            writes.push({ path, content })
          },
          mkdirp: async () => {},
        },
        lifecycle: {
          shutdown: async () => {},
          waitForShutdown: async () => {},
          start: async () => {},
          waitUntilReady: async () => {},
        },
        lock: { withLock: async (_key, run) => run() },
      }),
    )

    expect(result.spec).toEqual({
      command: "steam",
      args: ["-applaunch", "2379780"],
    })
    expect(writes).toEqual([])
    expect(JSON.stringify(result)).not.toContain("korri-steam-wrapper-launch")
  })

  it("resolves Steam storage tokens in process arguments", async () => {
    await withRoot(async root => {
      const storageRoot = join(root, "steam-storage")
      await mkdir(storageRoot)
      const events: string[] = []
      const files = new Map<string, string>()

      await runPromise(
        materializeReadableSteamLaunch({
          context: {
            ...steamContext("/steam-home"),
            storage: { steam: { id: "steam", root: storageRoot } },
            steam: {
              ...steamContext("/steam-home").steam,
              extra: { args: ["{storage:steam}/overlay", "-silent"] },
            },
          },
          fs: {
            readText: async path => files.get(path),
            writeTextAtomic: async (path, content) => {
              files.set(path, content)
            },
            mkdirp: async () => {},
          },
          lifecycle: {
            shutdown: async () => {},
            waitForShutdown: async () => {},
            start: async input => {
              events.push(`start:${input.args.join(" ")}`)
            },
            waitUntilReady: async () => {},
          },
          lock: { withLock: async (_key, run) => run() },
        }),
      )

      expect(events).toEqual([`start:${storageRoot}/overlay -silent`])
    })
  })

  it("fails before mutation when Steam state.root is missing", async () => {
    const exit = await Effect.runPromiseExit(
      materializeReadableSteamLaunch({
        context: { ...steamContext("/steam-home"), steam: {} },
        fs: {
          readText: async () => undefined,
          writeTextAtomic: async () => {},
          mkdirp: async () => {},
        },
      }),
    )

    expect(exitFailureMessage(exit)).toContain("state.root")
  })

  it("rejects non-Steam apps at the materializer boundary", async () => {
    const exit = await Effect.runPromiseExit(
      materializeReadableSteamLaunch({
        context: {
          ...steamContext("/steam-home"),
          app: { id: "retroarch", kind: "retroarch", command: "retroarch" },
        },
      }),
    )

    expect(exitFailureMessage(exit)).toContain("requires kind: steam")
  })

  it("fails before mutation when Steam storage tokens are unavailable", async () => {
    const writes: string[] = []
    const exit = await Effect.runPromiseExit(
      materializeReadableSteamLaunch({
        context: {
          ...steamContext("{storage:steam}/Steam"),
          storage: {},
        },
        fs: {
          readText: async () => undefined,
          writeTextAtomic: async path => {
            writes.push(path)
          },
          mkdirp: async () => {},
        },
      }),
    )

    expect(exitFailureMessage(exit)).toContain("storage steam")
    expect(writes).toEqual([])
  })

  it("fails before mutation when Steam extra args reference missing storage", async () => {
    const writes: string[] = []
    const exit = await Effect.runPromiseExit(
      materializeReadableSteamLaunch({
        context: {
          ...steamContext("/steam-home"),
          storage: {},
          steam: {
            ...steamContext("/steam-home").steam,
            extra: { args: ["{storage:games}/overlay"] },
          },
        },
        fs: {
          readText: async () => undefined,
          writeTextAtomic: async path => {
            writes.push(path)
          },
          mkdirp: async () => {},
        },
      }),
    )

    expect(exitFailureMessage(exit)).toContain("storage games")
    expect(writes).toEqual([])
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
