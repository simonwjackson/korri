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
} from "./cascade-resolver"
import type { GameRecord } from "./records/game"
import type { GlobalConfigRecord } from "./records/global"
import type { LauncherRecord } from "./records/launcher"
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
  games?: readonly GameRecord[]
}): ConfigSnapshot => ({
  global: input.global ?? null,
  users: new Map((input.users ?? []).map(u => [u.id, u])),
  systems: new Map((input.systems ?? []).map(s => [s.id, s])),
  launchers: new Map((input.launchers ?? []).map(l => [l.id, l])),
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
  it("defaults Gamescope to enabled when no layer has a Gamescope opinion", () => {
    const snap = snapshotOf({
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.gamescope).toEqual({ enabled: true })
  })

  it("defaults args-only Gamescope policy to enabled", () => {
    const snap = snapshotOf({
      global: globalConfig({ gamescope: { args: ["--expose-wayland"] } }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })

    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.gamescope).toEqual({ enabled: true, args: ["--expose-wayland"] })
  })

  it("game.gamescope.enabled=true overrides global false", () => {
    const snap = snapshotOf({
      global: globalConfig({ gamescope: { enabled: false } }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero", gamescope: { enabled: true } })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.gamescope?.enabled).toBe(true)
  })

  it("explicit false at more-specific layer overrides inherited true", () => {
    const snap = snapshotOf({
      global: globalConfig({ gamescope: { enabled: true } }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero", gamescope: { enabled: false } })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.gamescope?.enabled).toBe(false)
  })

  it("deep-merges gamescope.args as list concat in inheritance order", () => {
    const snap = snapshotOf({
      global: globalConfig({
        gamescope: { enabled: true, args: ["-F", "fsr"] },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          gamescope: { args: ["-W", "1920"] },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    expect(ctx.gamescope?.enabled).toBe(true)
    expect(ctx.gamescope?.args).toEqual(["-F", "fsr", "-W", "1920"])
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

  it("override gamescope contributes as the most-specific layer", () => {
    const snap = snapshotOf({
      global: globalConfig({ gamescope: { enabled: false } }),
      systems: [system({ id: "snes", launcher: "retroarch" })],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero", gamescope: { enabled: false } })],
    })
    const ctx = run(
      resolveLaunchContext(snap, {
        gameId: "fzero",
        override: { gamescope: { enabled: true, args: ["-F", "fsr"] } },
      }),
    )
    expect(ctx.gamescope?.enabled).toBe(true)
    expect(ctx.gamescope?.args).toEqual(["-F", "fsr"])
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
})

describe("resolveLaunchContext — inherit:false escape hatch", () => {
  it("inherit:false on system truncates global+user contributions", () => {
    const snap = snapshotOf({
      global: globalConfig({
        gamescope: { enabled: true, args: ["-F", "fsr"] },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          inherit: false,
          gamescope: { args: ["-W", "1920"] },
        }),
      ],
      launchers: [launcher({ id: "retroarch", systems: ["snes"] })],
      games: [game({ id: "fzero" })],
    })
    const ctx = run(resolveLaunchContext(snap, { gameId: "fzero" }))
    // Global's gamescope.enabled is dropped; system args survive and the
    // product default still enables Gamescope unless this layer disables it.
    expect(ctx.gamescope?.enabled).toBe(true)
    expect(ctx.gamescope?.args).toEqual(["-W", "1920"])
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
        presets: { "max-quality": { gamescope: { enabled: true } } },
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
          presets: { "max-quality": { gamescope: { args: ["-W", "1920"] } } },
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
        presets: { "max-quality": { gamescope: { enabled: true } } },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          presets: {
            "max-quality": {
              inherit: false,
              gamescope: { args: ["-W", "1920"] },
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
        presets: { "max-quality": { gamescope: { enabled: true } } },
      }),
      systems: [
        system({
          id: "snes",
          launcher: "retroarch",
          presets: {
            "max-quality": { gamescope: { args: ["-W", "1920"] } },
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
    expect(ctx.gamescope?.enabled).toBe(true)
    expect(ctx.gamescope?.args).toEqual(["-W", "1920"])
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
        gamescope: { enabled: false, args: ["-F", "fsr"] },
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
          gamescope: { enabled: true },
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
    expect(ctx.gamescope?.enabled).toBe(true)
    expect(ctx.gamescope?.args).toEqual(["-F", "fsr"])
    expect(ctx.env).toEqual({ LANG: "en_US.UTF-8" })
    expect(ctx.argsAppend).toEqual(["--g", "--game"])
  })
})
