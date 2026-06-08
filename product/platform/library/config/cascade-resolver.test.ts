/**
 * Cascade resolver tests — covers the skeleton pass, preset
 * enumeration, the full deep-merge cascade, error paths, and the
 * cross-validation pass.
 *
 * Test posture: pure functions over hand-rolled `ConfigSnapshot`
 * fixtures (no proseql, no I/O). Each scenario builds the minimal
 * snapshot needed to exercise one merge rule or error path.
 */

import { describe, expect, it } from "bun:test"
import { Cause, Effect } from "effect"

import {
  type ConfigSnapshot,
  emptySnapshot,
  enumerateApplicablePresets,
  resolveLaunchContext,
  resolveLocalLauncherGamescopePolicy,
  resolveLocalLauncherPolicy,
} from "./cascade-resolver"
import type { AppRecord } from "./records/app"
import type { GameRecord } from "./records/game"
import type { GlobalConfigRecord } from "./records/global"
import type { LauncherRecord } from "./records/launcher"
import type { ModuleRecord } from "./records/module"
import type { SystemRecord } from "./records/system"
import type { UserRecord } from "./records/user"

const game = (input: Partial<GameRecord> & { id: string }): GameRecord => ({
  system: "snes",
  contentPath: "/storage/roms/test.smc",
  ...input,
})

const system = (
  input: Partial<SystemRecord> & { id: string },
): SystemRecord => ({ ...input })

const launcher = (
  input: Partial<LauncherRecord> & { id: string },
): LauncherRecord => ({
  command: "/usr/bin/retroarch",
  args: ["{contentPath}"],
  systems: ["snes"],
  ...input,
})

const user = (input: Partial<UserRecord> & { id: string }): UserRecord => ({
  ...input,
})

const globalConfig = (
  input: Partial<GlobalConfigRecord>,
): GlobalConfigRecord => ({ id: "global", ...input })

const snapshotOf = (input: {
  global?: GlobalConfigRecord | null
  users?: readonly UserRecord[]
  systems?: readonly SystemRecord[]
  launchers?: readonly LauncherRecord[]
  apps?: readonly AppRecord[]
  modules?: readonly ModuleRecord[]
  games?: readonly GameRecord[]
}): ConfigSnapshot => ({
  global: input.global ?? null,
  users: new Map((input.users ?? []).map(u => [u.id, u])),
  systems: new Map((input.systems ?? []).map(s => [s.id, s])),
  launchers: new Map((input.launchers ?? []).map(l => [l.id, l])),
  apps: new Map((input.apps ?? []).map(a => [a.id, a])),
  modules: new Map((input.modules ?? []).map(m => [m.id, m])),
  games: new Map((input.games ?? []).map(g => [g.id, g])),
  collections: new Map(),
})

const run = <A, E>(eff: Effect.Effect<A, E>) => Effect.runSync(eff)
const runErrTag = <A, E>(eff: Effect.Effect<A, E>): string | undefined => {
  const exit = Effect.runSyncExit(eff)
  if (exit._tag !== "Failure") return undefined
  const result = Cause.findError(exit.cause) as
    | { success?: { _tag?: string } }
    | undefined
  return result?.success?._tag
}

describe("resolveLaunchContext — pure inheritance (no presets)", () => {
  it("keeps legacy contentPath records resolved without artifact I/O", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        game({ id: "fzero", contentPath: "/storage/roms/snes/f-zero.smc" }),
      ],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))

    expect(ctx.contentPath).toBe("/storage/roms/snes/f-zero.smc")
    expect(ctx.content).toBeUndefined()
  })

  it("carries artifact-backed content references without resolving blobs", () => {
    const artifactId =
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        {
          id: "fzero",
          system: "snes",
          content: { artifactId },
        },
      ],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))

    expect(ctx.contentPath).toBeUndefined()
    expect(ctx.content).toEqual({ artifactId })
  })

  it("resolves launcher from system when no game-level launcher is set", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.launcherId).toBe("retroarch")
    expect(ctx.system).toBe("snes")
    expect(ctx.contentPath).toBe("/storage/roms/test.smc")
  })

  it("resolves game-level launcher over system-level", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "snes9x", systems: ["snes"] })],
      games: [game({ id: "fzero", launcher: "snes9x" })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.launcherId).toBe("snes9x")
  })

  it("resolves core from system.cores[launcher]", () => {
    const snap = snapshotOf({
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          cores: { retroarch: "snes9x_libretro.so" },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.core).toBe("snes9x_libretro.so")
  })

  it("game-level 'core' overrides system.cores[launcher]", () => {
    const snap = snapshotOf({
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          cores: { retroarch: "snes9x_libretro.so" },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero", core: "snes9x_native" })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.core).toBe("snes9x_native")
  })
})

describe("resolveLaunchContext — gamescope policy fold", () => {
  it("defaults Gamescope to enabled with kiosk-shaped nested policy when no layer has a Gamescope opinion", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.gamescope).toEqual({
      enable: true,
      backend: { type: "wayland" },
      window: {
        fullscreen: true,
        borderless: true,
        exposeWayland: true,
      },
    })
  })

  it("defaults extraArgs-only Gamescope policy to enabled with the default backend", () => {
    const snap = snapshotOf({
      global: globalConfig({ gamescope: { extraArgs: ["--filter=fsr"] } }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.gamescope).toEqual({
      enable: true,
      backend: { type: "wayland" },
      window: {
        fullscreen: true,
        borderless: true,
        exposeWayland: true,
      },
      extraArgs: ["--filter=fsr"],
    })
  })

  it("deep-merges nested Gamescope objects without replacing sibling fields", () => {
    const snap = snapshotOf({
      global: globalConfig({
        gamescope: {
          backend: { type: "sdl", allowDeferred: true },
          window: { fullscreen: true, exposeWayland: false },
          display: { output: { width: 1280 }, nested: { width: 640 } },
        },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          gamescope: {
            display: { output: { height: 720 }, nested: { height: 480 } },
          },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        game({ id: "fzero", gamescope: { backend: { type: "wayland" } } }),
      ],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.gamescope).toMatchObject({
      enable: true,
      backend: { type: "wayland", allowDeferred: true },
      window: {
        fullscreen: true,
        borderless: true,
        exposeWayland: false,
      },
      display: {
        output: { width: 1280, height: 720 },
        nested: { width: 640, height: 480 },
      },
    })
  })

  it("game.gamescope.enable=true overrides global false", () => {
    const snap = snapshotOf({
      global: globalConfig({ gamescope: { enable: false } }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero", gamescope: { enable: true } })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.gamescope?.enable).toBe(true)
  })

  it("explicit false at more-specific layer overrides inherited true and defaults", () => {
    const snap = snapshotOf({
      global: globalConfig({
        gamescope: {
          enable: true,
          window: { fullscreen: true, exposeWayland: true },
        },
      }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        game({
          id: "fzero",
          gamescope: {
            enable: false,
            window: { fullscreen: false, exposeWayland: false },
          },
        }),
      ],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.gamescope?.enable).toBe(false)
    expect(ctx.gamescope?.window?.fullscreen).toBe(false)
    expect(ctx.gamescope?.window?.exposeWayland).toBe(false)
  })

  it("concatenates gamescope.extraArgs in inheritance order", () => {
    const snap = snapshotOf({
      global: globalConfig({
        gamescope: { enable: true, extraArgs: ["-F", "fsr"] },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          gamescope: { extraArgs: ["-W", "1920"] },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.gamescope?.enable).toBe(true)
    expect(ctx.gamescope?.extraArgs).toEqual(["-F", "fsr", "-W", "1920"])
  })

  it("preserves nullable environment unsets across normalization", () => {
    const snap = snapshotOf({
      global: globalConfig({
        gamescope: {
          environment: { OUTER_ONLY: "host", OUTER_UNSET: "1" },
          app: { environment: { WAYLAND_DISPLAY: "wayland-1" } },
        },
      }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        game({
          id: "fzero",
          gamescope: {
            environment: { OUTER_UNSET: null },
            app: { environment: { WAYLAND_DISPLAY: null } },
          },
        }),
      ],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.gamescope?.environment).toEqual({
      OUTER_ONLY: "host",
      OUTER_UNSET: null,
    })
    expect(ctx.gamescope?.app?.environment).toEqual({ WAYLAND_DISPLAY: null })
  })
})

describe("resolveLaunchContext — retroarch policy fold", () => {
  it("folds app, preset, and game RetroArch policy with deterministic merge semantics", () => {
    const snap = snapshotOf({
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          presets: {
            handheld: {
              retroarch: {
                configFile: { append: ["/tmp/preset.cfg"] },
                environment: { RA_UNSET: null },
                video: { fullscreen: false },
                extraSettings: { video_font_enable: false },
                extraArgs: ["preset"],
              },
            },
          },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      apps: [
        {
          id: "retroarch",
          kind: "retroarch",
          configFile: { append: ["/tmp/app.cfg"] },
          environment: { RA_KEEP: "1", RA_UNSET: "1" },
          video: { fullscreen: true, vsync: true },
          extraSettings: { video_font_enable: true },
          extraArgs: ["app"],
        },
      ],
      games: [
        game({
          id: "fzero",
          retroarch: {
            configFile: { append: ["/tmp/game.cfg"] },
            extraArgs: ["game"],
          },
        }),
      ],
    })

    const ctx = run(
      resolveLaunchContext(snap, { gameId: "fzero", presetId: "handheld" }),
    )

    expect(ctx.retroarch).toMatchObject({
      configFile: {
        append: ["/tmp/app.cfg", "/tmp/game.cfg", "/tmp/preset.cfg"],
      },
      environment: { RA_KEEP: "1", RA_UNSET: null },
      video: { fullscreen: false, vsync: true },
      extraSettings: { video_font_enable: false },
      extraArgs: ["app", "game", "preset"],
    })
  })
})

describe("resolveLaunchContext — moonlight policy fold", () => {
  it("deep-merges nested Moonlight objects without replacing sibling fields", () => {
    const snap = snapshotOf({
      global: globalConfig({
        moonlight: {
          stream: { resolution: { width: 1280 }, fps: 60 },
          input: { touch: { absolute: true } },
        },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          moonlight: {
            stream: { resolution: { height: 720 } },
            input: { touch: { requireBounds: true } },
          },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.moonlight).toMatchObject({
      stream: { resolution: { width: 1280, height: 720 }, fps: 60 },
      input: { touch: { absolute: true, requireBounds: true } },
    })
  })

  it("concatenates Moonlight input.devices and extraArgs in inheritance order", () => {
    const snap = snapshotOf({
      global: globalConfig({
        moonlight: {
          input: { devices: ["/dev/input/event-global"] },
          extraArgs: ["global"],
        },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          moonlight: {
            input: { devices: ["/dev/input/event-system"] },
            extraArgs: ["system"],
          },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        game({
          id: "fzero",
          moonlight: {
            input: { devices: ["/dev/input/event-game"] },
            extraArgs: ["game"],
          },
        }),
      ],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.moonlight?.input?.devices).toEqual([
      "/dev/input/event-global",
      "/dev/input/event-system",
      "/dev/input/event-game",
    ])
    expect(ctx.moonlight?.extraArgs).toEqual(["global", "system", "game"])
  })

  it("preserves explicit false and nullable environment unsets", () => {
    const snap = snapshotOf({
      global: globalConfig({
        moonlight: {
          environment: { KEEP: "1", UNSET_ME: "1" },
          logging: { verbose: true },
          window: { autoResize: true },
          control: { enable: true },
        },
      }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        game({
          id: "fzero",
          moonlight: {
            environment: { UNSET_ME: null },
            logging: { verbose: false },
            window: { autoResize: false },
            control: { enable: false },
          },
        }),
      ],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.moonlight?.environment).toEqual({ KEEP: "1", UNSET_ME: null })
    expect(ctx.moonlight?.logging?.verbose).toBe(false)
    expect(ctx.moonlight?.window?.autoResize).toBe(false)
    expect(ctx.moonlight?.control?.enable).toBe(false)
  })
})

describe("resolveLocalLauncherGamescopePolicy", () => {
  it("resolves sibling local launcher Moonlight and Gamescope policies without a game id", () => {
    const snap = snapshotOf({
      global: globalConfig({
        gamescope: { enable: false },
        moonlight: {
          environment: { FROM_GLOBAL: "1", UNSET_ME: "1" },
          input: { devices: ["/dev/input/event-global"] },
          extraArgs: ["global"],
        },
      }),
      launchers: [
        launcher({
          id: "moonlight",
          systems: [],
          gamescope: { extraArgs: ["--expose-wayland"] },
          moonlight: {
            platform: { name: "v4l2m2m" },
            environment: { UNSET_ME: null },
            input: { devices: ["/dev/input/event-launcher"] },
            extraArgs: ["launcher"],
          },
        }),
      ],
      games: [],
    })

    const policy = resolveLocalLauncherPolicy(snap, {
      launcherId: "moonlight",
      override: { gamescope: { enable: true } },
    })

    expect(policy.gamescope.enable).toBe(true)
    expect(policy.gamescope.extraArgs).toEqual(["--expose-wayland"])
    expect(policy.moonlight).toEqual({
      environment: { FROM_GLOBAL: "1", UNSET_ME: null },
      platform: { name: "v4l2m2m" },
      input: {
        devices: ["/dev/input/event-global", "/dev/input/event-launcher"],
      },
      extraArgs: ["global", "launcher"],
    })
  })

  it("resolves local launcher policy from global, launcher, and override without a game id", () => {
    const snap = snapshotOf({
      global: globalConfig({ gamescope: { enable: false } }),
      launchers: [
        launcher({
          id: "moonlight",
          systems: [],
          gamescope: {
            command: "/run/current-system/sw/bin/korri-gamescope-no-portal",
            extraArgs: ["--expose-wayland"],
          },
        }),
      ],
      games: [],
    })

    expect(
      resolveLocalLauncherGamescopePolicy(snap, {
        launcherId: "moonlight",
        override: { gamescope: { enable: true } },
      }),
    ).toEqual({
      enable: true,
      command: "/run/current-system/sw/bin/korri-gamescope-no-portal",
      backend: { type: "wayland" },
      window: {
        fullscreen: true,
        borderless: true,
        exposeWayland: true,
      },
      extraArgs: ["--expose-wayland"],
    })
  })

  it("uses the product default when local launcher config is absent", () => {
    expect(
      resolveLocalLauncherGamescopePolicy(emptySnapshot(), {
        launcherId: "moonlight",
      }),
    ).toEqual({
      enable: true,
      backend: { type: "wayland" },
      window: {
        fullscreen: true,
        borderless: true,
        exposeWayland: true,
      },
    })
  })
})

describe("resolveLaunchContext — env / cwd / argsAppend folds", () => {
  it("env map-merges per key; more-specific wins", () => {
    const snap = snapshotOf({
      global: globalConfig({ env: { LANG: "C", GLOBAL_KEY: "g" } }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          env: { LANG: "en_US.UTF-8", SYS_KEY: "s" },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero", env: { GAME_KEY: "x" } })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.env).toEqual({
      LANG: "en_US.UTF-8",
      GLOBAL_KEY: "g",
      SYS_KEY: "s",
      GAME_KEY: "x",
    })
  })

  it("argsAppend concatenates in inheritance order", () => {
    const snap = snapshotOf({
      global: globalConfig({ argsAppend: ["--g"] }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          argsAppend: ["--s"],
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero", argsAppend: ["--game"] })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.argsAppend).toEqual(["--g", "--s", "--game"])
  })

  it("patches concatenate in inheritance order", () => {
    const snap = snapshotOf({
      global: globalConfig({ patches: ["/patches/global.ips"] }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          patches: ["/patches/system.bps"],
        }),
      ],
      launchers: [
        launcher({
          id: "retroarch",
          systems: ["snes"],
          patches: ["/patches/launcher.ups"],
        }),
      ],
      games: [game({ id: "fzero", patches: ["/patches/game.ips"] })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.patches).toEqual([
      "/patches/global.ips",
      "/patches/system.bps",
      "/patches/launcher.ups",
      "/patches/game.ips",
    ])
  })

  it("folds a legacy launcher layer once when its id is also a built-in app", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [
        launcher({
          id: "retroarch",
          systems: ["snes"],
          argsAppend: ["--launcher"],
        }),
      ],
      games: [game({ id: "fzero" })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.argsAppend).toEqual(["--launcher"])
  })

  it("cwd takes the most-specific scalar", () => {
    const snap = snapshotOf({
      global: globalConfig({ cwd: "/g" }),
      systems: [system({ id: "snes", launcher: "retroarch", cwd: "/s" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero", cwd: "/game" })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.cwd).toBe("/game")
  })

  it("launch-local cwd and env win over same-layer top-level fields", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        game({
          id: "fzero",
          cwd: "/legacy",
          env: { KORRI_LAYER: "legacy", KEEP: "yes" },
          launch: {
            cwd: "/launch",
            env: { KORRI_LAYER: "launch" },
          },
        }),
      ],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.cwd).toBe("/launch")
    expect(ctx.env).toEqual({ KORRI_LAYER: "launch", KEEP: "yes" })
  })
})

describe("resolveLaunchContext — byLauncher", () => {
  it("merges byLauncher[L] at each layer when L is the resolved launcher", () => {
    const snap = snapshotOf({
      global: globalConfig({
        byLauncher: { retroarch: { argsAppend: ["--gr"] } },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          byLauncher: { retroarch: { argsAppend: ["--sr"] } },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        game({
          id: "fzero",
          byLauncher: { retroarch: { argsAppend: ["--gamer"] } },
        }),
      ],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.argsAppend).toEqual(["--gr", "--sr", "--gamer"])
  })

  it("merges byLauncher[L] patch contributions when L is the resolved launcher", () => {
    const snap = snapshotOf({
      global: globalConfig({
        byLauncher: { retroarch: { patches: ["/patches/global-ra.ips"] } },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          byLauncher: { retroarch: { patches: ["/patches/system-ra.bps"] } },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        game({
          id: "fzero",
          byLauncher: { retroarch: { patches: ["/patches/game-ra.ups"] } },
        }),
      ],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.patches).toEqual([
      "/patches/global-ra.ips",
      "/patches/system-ra.bps",
      "/patches/game-ra.ups",
    ])
  })

  it("ignores byLauncher entries for non-resolved launchers", () => {
    const snap = snapshotOf({
      global: globalConfig({
        byLauncher: { dolphin: { argsAppend: ["--dolphin"] } },
      }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.argsAppend ?? []).toEqual([])
  })

  it("ignores byLauncher patch entries for non-resolved launchers", () => {
    const snap = snapshotOf({
      global: globalConfig({
        byLauncher: { dolphin: { patches: ["/patches/dolphin.ips"] } },
      }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.patches ?? []).toEqual([])
  })
})

describe("resolveLaunchContext — ephemeral override", () => {
  it("override.launcher wins over every record's launcher", () => {
    const snap = snapshotOf({
      global: globalConfig({ launcher: "g" }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [
        launcher({ id: "retroarch", systems: ["snes"] }),
        launcher({ id: "snes9x", systems: ["snes"] }),
      ],
      games: [game({ id: "fzero", launcher: "retroarch" })],
    })
    const ctx = run(
      resolveLaunchContext(snap, {
        gameId: "fzero",
        override: { launcher: "snes9x" },
      }),
    )
    expect(ctx.launcherId).toBe("snes9x")
  })

  it("override safe gamescope fields contribute as the most-specific layer", () => {
    const snap = snapshotOf({
      global: globalConfig({ gamescope: { enable: false } }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero", gamescope: { enable: false } })],
    })
    const ctx = run(
      resolveLaunchContext(snap, {
        gameId: "fzero",
        override: { gamescope: { enable: true, scaling: { filter: "fsr" } } },
      }),
    )
    expect(ctx.gamescope?.enable).toBe(true)
    expect(ctx.gamescope?.scaling?.filter).toBe("fsr")
  })

  it("override argsAppend concatenates at the end", () => {
    const snap = snapshotOf({
      global: globalConfig({ argsAppend: ["--g"] }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const ctx = run(
      resolveLaunchContext(snap, {
        gameId: "fzero",
        override: { argsAppend: ["--o"] },
      }),
    )
    expect(ctx.argsAppend).toEqual(["--g", "--o"])
  })

  it("override patches concatenate at the end", () => {
    const snap = snapshotOf({
      global: globalConfig({ patches: ["/patches/global.ips"] }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero", patches: ["/patches/game.bps"] })],
    })
    const ctx = run(
      resolveLaunchContext(snap, {
        gameId: "fzero",
        override: { patches: ["/patches/override.ups"] },
      }),
    )
    expect(ctx.patches).toEqual([
      "/patches/global.ips",
      "/patches/game.bps",
      "/patches/override.ups",
    ])
  })
})

describe("resolveLaunchContext — inherit:false escape hatch", () => {
  it("inherit:false on system truncates global+user contributions", () => {
    const snap = snapshotOf({
      global: globalConfig({
        gamescope: { enable: true, extraArgs: ["-F", "fsr"] },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          inherit: false,
          gamescope: { extraArgs: ["-W", "1920"] },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    // Global's gamescope.enable is dropped; system extraArgs survive and the
    // product default still enables Gamescope unless this layer disables it.
    expect(ctx.gamescope?.enable).toBe(true)
    expect(ctx.gamescope?.extraArgs).toEqual(["-W", "1920"])
  })

  it("inherit:false on game truncates everything less-specific", () => {
    const snap = snapshotOf({
      global: globalConfig({ argsAppend: ["--g"] }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          argsAppend: ["--s"],
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        game({
          id: "fzero",
          inherit: false,
          argsAppend: ["--game"],
        }),
      ],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.argsAppend).toEqual(["--game"])
  })

  it("inherit:false on game truncates less-specific patches", () => {
    const snap = snapshotOf({
      global: globalConfig({ patches: ["/patches/global.ips"] }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          patches: ["/patches/system.bps"],
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        game({
          id: "fzero",
          inherit: false,
          patches: ["/patches/game.ups"],
        }),
      ],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.patches).toEqual(["/patches/game.ups"])
  })
})

describe("enumerateApplicablePresets", () => {
  it("returns empty map for a game with no presets at any layer", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const menu = run(enumerateApplicablePresets(snap, { gameId: "fzero" }))
    expect(menu.size).toBe(0)
  })

  it("collects always-visible presets from global/user/system/game", () => {
    const snap = snapshotOf({
      global: globalConfig({
        presets: { "max-quality": { gamescope: { enable: true } } },
      }),
      users: [
        user({
          id: "simon",
          presets: { "max-quality": { argsAppend: ["-u"] } },
        }),
      ],
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          presets: {
            "max-quality": { gamescope: { extraArgs: ["-W", "1920"] } },
          },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        game({
          id: "fzero",
          presets: { "max-quality": { argsAppend: ["-g"] } },
        }),
      ],
    })
    const menu = run(
      enumerateApplicablePresets(snap, {
        gameId: "fzero",
        userId: "simon",
      }),
    )
    const chain = menu.get("max-quality")
    expect(chain?.length).toBe(4)
    expect(chain?.map(p => p.layer)).toEqual([
      "global",
      "user",
      "system",
      "game",
    ])
  })

  it("includes launcher-layer presets only for the skeleton launcher", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [
        launcher({
          id: "retroarch",
          systems: ["snes"],
          presets: { fast: { argsAppend: ["--fast"] } },
        }),
        launcher({
          id: "snes9x",
          systems: ["snes"],
          presets: { fast: { argsAppend: ["--snes9x"] } },
        }),
      ],
      games: [game({ id: "fzero" })],
    })
    const menu = run(enumerateApplicablePresets(snap, { gameId: "fzero" }))
    const chain = menu.get("fast")
    expect(chain?.length).toBe(1)
    expect(chain?.[0]?.layer).toBe("launcher")
  })

  it("inherit:false on a preset link truncates less-specific links", () => {
    const snap = snapshotOf({
      global: globalConfig({
        presets: { "max-quality": { gamescope: { enable: true } } },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          presets: {
            "max-quality": {
              inherit: false,
              gamescope: { extraArgs: ["-W", "1920"] },
            },
          },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const menu = run(enumerateApplicablePresets(snap, { gameId: "fzero" }))
    const chain = menu.get("max-quality")
    // Global link dropped; only system survives.
    expect(chain?.length).toBe(1)
    expect(chain?.[0]?.layer).toBe("system")
  })
})

describe("resolveLaunchContext — preset selection", () => {
  it("applies a same-name preset chain (global+system) as a deep-merge", () => {
    const snap = snapshotOf({
      global: globalConfig({
        presets: { "max-quality": { gamescope: { enable: true } } },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          presets: {
            "max-quality": { gamescope: { extraArgs: ["-W", "1920"] } },
          },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const ctx = run(
      resolveLaunchContext(snap, {
        gameId: "fzero",
        presetId: "max-quality",
      }),
    )
    expect(ctx.gamescope?.enable).toBe(true)
    expect(ctx.gamescope?.extraArgs).toEqual(["-W", "1920"])
  })

  it("appends selected preset patches after base game patches", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [
        game({
          id: "fzero",
          patches: ["/patches/base.ips"],
          presets: { color: { patches: ["/patches/color.bps"] } },
        }),
      ],
    })
    const ctx = run(
      resolveLaunchContext(snap, {
        gameId: "fzero",
        presetId: "color",
      }),
    )
    expect(ctx.patches).toEqual(["/patches/base.ips", "/patches/color.bps"])
  })

  it("preset can switch the resolved launcher (presets are the full behavior layer)", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [
        launcher({ id: "retroarch", systems: ["snes"] }),
        launcher({ id: "snes9x", systems: ["snes"] }),
      ],
      games: [
        game({
          id: "fzero",
          presets: { native: { launcher: "snes9x" } },
        }),
      ],
    })
    const ctx = run(
      resolveLaunchContext(snap, {
        gameId: "fzero",
        presetId: "native",
      }),
    )
    expect(ctx.launcherId).toBe("snes9x")
  })

  it("inherit:false on the selected preset chain drops less-specific layer contributions of the same preset", () => {
    const snap = snapshotOf({
      global: globalConfig({
        argsAppend: ["--global-base"],
        presets: { perf: { argsAppend: ["--p-global"] } },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          presets: {
            perf: { inherit: false, argsAppend: ["--p-system"] },
          },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const ctx = run(
      resolveLaunchContext(snap, {
        gameId: "fzero",
        presetId: "perf",
      }),
    )
    // Global base (outside preset chain) still flows; preset's global link
    // is dropped; preset's system link survives.
    expect(ctx.argsAppend).toEqual(["--global-base", "--p-system"])
  })

  it("inherit:false on the selected preset chain drops less-specific preset patches", () => {
    const snap = snapshotOf({
      global: globalConfig({
        patches: ["/patches/global-base.ips"],
        presets: { perf: { patches: ["/patches/p-global.ips"] } },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          presets: {
            perf: { inherit: false, patches: ["/patches/p-system.bps"] },
          },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const ctx = run(
      resolveLaunchContext(snap, {
        gameId: "fzero",
        presetId: "perf",
      }),
    )
    expect(ctx.patches).toEqual([
      "/patches/global-base.ips",
      "/patches/p-system.bps",
    ])
  })
})

describe("resolveLaunchContext — error paths", () => {
  it("returns GameNotFound for an unknown gameId", () => {
    const snap = emptySnapshot()
    expect(runErrTag(resolveLaunchContext(snap, { gameId: "missing" }))).toBe(
      "GameNotFound",
    )
  })

  it("returns UserNotFound for a provided-but-unknown userId", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    expect(
      runErrTag(
        resolveLaunchContext(snap, { gameId: "fzero", userId: "ghost" }),
      ),
    ).toBe("UserNotFound")
  })

  it("succeeds when userId is omitted (no user-layer contribution)", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.launcherId).toBe("retroarch")
  })

  it("returns PresetNotFound for a presetId not in the applicable menu", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    expect(
      runErrTag(
        resolveLaunchContext(snap, {
          gameId: "fzero",
          presetId: "no-such-preset",
        }),
      ),
    ).toBe("PresetNotFound")
  })

  it("returns LauncherUnresolvable when no layer sets a launcher", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes" })],
      games: [game({ id: "fzero" })],
    })
    expect(runErrTag(resolveLaunchContext(snap, { gameId: "fzero" }))).toBe(
      "LauncherUnresolvable",
    )
  })

  it("returns CoreNotConfigured when launcher template needs a core and none resolves", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [
        // Template references {core}; no system.cores[retroarch], no game.core.
        launcher({
          id: "retroarch",
          systems: ["snes"],
          args: ["-L", "{core}", "{contentPath}"],
        }),
      ],
      games: [game({ id: "fzero" })],
    })
    expect(runErrTag(resolveLaunchContext(snap, { gameId: "fzero" }))).toBe(
      "CoreNotConfigured",
    )
  })
})

describe("resolveLaunchContext — end-to-end smoke", () => {
  it("populates every output field path from a fixture snapshot", () => {
    const snap = snapshotOf({
      global: globalConfig({
        gamescope: { enable: false, extraArgs: ["-F", "fsr"] },
        env: { LANG: "C" },
        argsAppend: ["--g"],
      }),
      users: [user({ id: "simon", displayName: "Simon" })],
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          cores: { retroarch: "snes9x_libretro.so" },
          env: { LANG: "en_US.UTF-8" },
        }),
      ],
      launchers: [
        launcher({
          id: "retroarch",
          systems: ["snes"],
          args: ["-L", "{core}", "{contentPath}"],
        }),
      ],
      games: [
        game({
          id: "fzero",
          contentPath: "/storage/roms/snes/f-zero.smc",
          gamescope: { enable: true },
          argsAppend: ["--game"],
        }),
      ],
    })

    const ctx = run(
      resolveLaunchContext(snap, { gameId: "fzero", userId: "simon" }),
    )

    expect(ctx.gameId).toBe("fzero")
    expect(ctx.launcherId).toBe("retroarch")
    expect(ctx.system).toBe("snes")
    expect(ctx.contentPath).toBe("/storage/roms/snes/f-zero.smc")
    expect(ctx.core).toBe("snes9x_libretro.so")
    expect(ctx.gamescope?.enable).toBe(true)
    expect(ctx.gamescope?.extraArgs).toEqual(["-F", "fsr"])
    expect(ctx.env).toEqual({ LANG: "en_US.UTF-8" })
    expect(ctx.argsAppend).toEqual(["--g", "--game"])
  })
})

describe("resolveLaunchContext — app/module launch blocks", () => {
  it("inherits launch.app and launch.module from the system and resolves module path", () => {
    const snap = snapshotOf({
      systems: [
        system({
          id: "pico8",
          launch: { app: "retroarch", module: "fake08" },
        }),
      ],
      modules: [
        {
          id: "fake08",
          kind: "libretro-core",
          path: "/etc/korri/cores/fake08_libretro.so",
        },
      ],
      games: [
        game({
          id: "porklike",
          system: "pico8",
          contentPath: "/storage/roms/pico8/porklike.p8",
        }),
      ],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "porklike" }))
    expect(ctx.launcherId).toBe("retroarch")
    expect(ctx.moduleId).toBe("fake08")
    expect(ctx.modulePath).toBe("/etc/korri/cores/fake08_libretro.so")
  })

  it("merges settings with explicit false and zero overriding broader values", () => {
    const snap = snapshotOf({
      apps: [
        {
          id: "retroarch",
          settings: { video_scale_integer: true, runahead_frames: 2 },
        },
      ],
      systems: [
        system({
          id: "pico8",
          launch: {
            app: "retroarch",
            module: "fake08",
            settings: { rewind_enable: true },
          },
        }),
      ],
      modules: [
        {
          id: "fake08",
          kind: "libretro-core",
          path: "/etc/korri/cores/fake08_libretro.so",
        },
      ],
      games: [
        game({
          id: "porklike",
          system: "pico8",
          launch: {
            settings: { video_scale_integer: false, runahead_frames: 0 },
          },
        }),
      ],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "porklike" }))
    expect(ctx.settings).toMatchObject({
      config_save_on_exit: false,
      rewind_enable: true,
      video_scale_integer: false,
      runahead_frames: 0,
    })
  })

  it("keeps legacy launcher/core/cores compatibility", () => {
    const snap = snapshotOf({
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          cores: { retroarch: "snes9x_libretro.so" },
        }),
      ],
      launchers: [
        launcher({ id: "retroarch", args: ["-L", "{core}", "{contentPath}"] }),
      ],
      games: [game({ id: "fzero" })],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.launcherId).toBe("retroarch")
    expect(ctx.core).toBe("snes9x_libretro.so")
  })

  it("fails when launch.module references an unknown module id", () => {
    const snap = snapshotOf({
      systems: [
        system({
          id: "pico8",
          launch: { app: "retroarch", module: "missing" },
        }),
      ],
      games: [game({ id: "porklike", system: "pico8" })],
    })

    expect(runErrTag(resolveLaunchContext(snap, { gameId: "porklike" }))).toBe(
      "ModuleNotFound",
    )
  })

  it("fails when the resolved app rejects the module kind", () => {
    const snap = snapshotOf({
      systems: [
        system({ id: "wii", launch: { app: "dolphin", module: "fake08" } }),
      ],
      modules: [
        {
          id: "fake08",
          kind: "libretro-core",
          path: "/etc/korri/cores/fake08_libretro.so",
        },
      ],
      games: [
        game({
          id: "wii-game",
          system: "wii",
          contentPath: "/storage/roms/wii/game.rvz",
        }),
      ],
    })

    expect(runErrTag(resolveLaunchContext(snap, { gameId: "wii-game" }))).toBe(
      "IncompatibleModule",
    )
  })
})
