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
import { Effect } from "effect"

import {
  type ConfigSnapshot,
  emptySnapshot,
  enumerateApplicablePresets,
  resolveLocalLauncherGamescopePolicy,
  resolveLocalLauncherPolicy,
} from "./cascade-resolver"
import type { GamescopePolicy } from "./inheritable-fields"
import type { AppRecord } from "./records/app"
import type { GameRecord } from "./records/game"
import type { GlobalConfigRecord } from "./records/global"
import type { LauncherRecord } from "./records/launcher"
import type { ModuleRecord } from "./records/module"
import type { SystemRecord } from "./records/system"
import type { UserRecord } from "./records/user"

const gamescopeLaunch = (policy: GamescopePolicy) => ({
  launch: { with: { "@korri:gamescope": policy } },
})

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

describe("resolveLocalLauncherGamescopePolicy", () => {
  it("resolves sibling local launcher Moonlight and Gamescope policies without a game id", () => {
    const snap = snapshotOf({
      global: globalConfig({
        ...gamescopeLaunch({ enable: false }),
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
          ...gamescopeLaunch({ extraArgs: ["--expose-wayland"] }),
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
      override: gamescopeLaunch({ enable: true }),
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
      global: globalConfig(gamescopeLaunch({ enable: false })),
      launchers: [
        launcher({
          id: "moonlight",
          systems: [],
          ...gamescopeLaunch({
            command: "/run/current-system/sw/bin/korri-gamescope-no-portal",
            extraArgs: ["--expose-wayland"],
          }),
        }),
      ],
      games: [],
    })

    expect(
      resolveLocalLauncherGamescopePolicy(snap, {
        launcherId: "moonlight",
        override: gamescopeLaunch({ enable: true }),
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

  it("merges launcher-specific Gamescope companions from byLauncher", () => {
    const snap = snapshotOf({
      global: globalConfig({
        ...gamescopeLaunch({ display: { nested: { width: 854 } } }),
        byLauncher: {
          moonlight: gamescopeLaunch({
            display: { nested: { height: 480 } },
            extraArgs: ["--expose-wayland"],
          }),
        },
      }),
      launchers: [launcher({ id: "moonlight", systems: [] })],
      games: [],
    })

    expect(
      resolveLocalLauncherGamescopePolicy(snap, { launcherId: "moonlight" }),
    ).toMatchObject({
      display: { nested: { width: 854, height: 480 } },
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
        presets: { "max-quality": gamescopeLaunch({ enable: true }) },
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
            "max-quality": gamescopeLaunch({ extraArgs: ["-W", "1920"] }),
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
        presets: { "max-quality": gamescopeLaunch({ enable: true }) },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          presets: {
            "max-quality": {
              inherit: false,
              ...gamescopeLaunch({ extraArgs: ["-W", "1920"] }),
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
