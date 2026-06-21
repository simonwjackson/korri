/**
 * compose-launch-spec tests — placeholder substitution + command policy.
 *
 * Inputs: a LauncherRecord (template) + a ResolvedLaunchContext (values).
 * Output: a LaunchSpec ready for the runner, or a CompositionError tag.
 */

import { describe, expect, it } from "bun:test"
import { Cause, Effect } from "effect"

import {
  composeLaunchSpec,
  composeReadableLaunchSpec,
} from "./compose-launch-spec"
import type { AppRecord } from "./records/app"
import type { LauncherRecord } from "./records/launcher"
import type {
  ReadableResolvedLaunchContext,
  ResolvedLaunchContext,
} from "./resolved-launch-context"

const launcher = (
  input: Partial<LauncherRecord> & { id: string },
): LauncherRecord => ({
  command: "/usr/bin/retroarch",
  args: [],
  systems: ["snes"],
  ...input,
})

const context = (
  input: Partial<ResolvedLaunchContext> & {
    gameId: string
    launcherId: string
  },
): ResolvedLaunchContext => ({
  contentPath: "/storage/roms/test.smc",
  system: "snes",
  ...input,
})

const readableContext = (
  input: Partial<ReadableResolvedLaunchContext>,
): ReadableResolvedLaunchContext => ({
  playableId: "yfs-level",
  itemId: "yfs-level",
  releaseId: "level",
  system: "yfs",
  target: "/storage/levels/level.json",
  app: {
    id: "@korri:yoshis-fabrication-station/level",
    command: "yfs-launch",
    args: ["{target}"],
  } as AppRecord,
  ...input,
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

describe("composeLaunchSpec — substitution", () => {
  it("substitutes {contentPath} and {core} from the resolved context", () => {
    const l = launcher({
      id: "retroarch",
      command: "/usr/bin/retroarch",
      args: ["-L", "{core}", "{contentPath}"],
    })
    const ctx = context({
      gameId: "fzero",
      launcherId: "retroarch",
      contentPath: "/storage/roms/snes/f-zero.smc",
      core: "snes9x_libretro.so",
    })
    const spec = run(composeLaunchSpec(l, ctx))
    expect(spec.command).toBe("/usr/bin/retroarch")
    expect(spec.args).toEqual([
      "-L",
      "snes9x_libretro.so",
      "/storage/roms/snes/f-zero.smc",
    ])
  })

  it("substitutes {system} and {emulator}", () => {
    const l = launcher({
      id: "rocknix",
      command: "/usr/bin/runemu.sh",
      args: ["-P{system}", "-E{emulator}", "{contentPath}"],
    })
    const ctx = context({
      gameId: "fzero",
      launcherId: "rocknix",
      emulator: "retroarch",
    })
    const spec = run(composeLaunchSpec(l, ctx))
    expect(spec.args).toEqual([
      "-Psnes",
      "-Eretroarch",
      "/storage/roms/test.smc",
    ])
  })

  it("passes through templates with no placeholders", () => {
    const l = launcher({
      id: "x",
      command: "/usr/bin/static",
      args: ["--flag", "--option=value"],
    })
    const ctx = context({ gameId: "g", launcherId: "x" })
    const spec = run(composeLaunchSpec(l, ctx))
    expect(spec.args).toEqual(["--flag", "--option=value"])
  })
})

describe("composeLaunchSpec — argsAppend / env / cwd", () => {
  it("appends argsAppend from the resolved context AFTER the template args", () => {
    const l = launcher({
      id: "retroarch",
      command: "/usr/bin/retroarch",
      args: ["-L", "{core}", "{contentPath}"],
    })
    const ctx = context({
      gameId: "fzero",
      launcherId: "retroarch",
      core: "snes9x_libretro.so",
      argsAppend: ["--fullscreen", "--verbose"],
    })
    const spec = run(composeLaunchSpec(l, ctx))
    expect(spec.args).toEqual([
      "-L",
      "snes9x_libretro.so",
      "/storage/roms/test.smc",
      "--fullscreen",
      "--verbose",
    ])
  })

  it("threads env through to the LaunchSpec", () => {
    const l = launcher({ id: "x" })
    const ctx = context({
      gameId: "g",
      launcherId: "x",
      env: { LANG: "en_US.UTF-8", SDL_VIDEODRIVER: "x11" },
    })
    const spec = run(composeLaunchSpec(l, ctx))
    expect(spec.env).toEqual({
      LANG: "en_US.UTF-8",
      SDL_VIDEODRIVER: "x11",
    })
  })

  it("substitutes resolved launch settings into env values", () => {
    const l = launcher({ id: "yfs" })
    const ctx = context({
      gameId: "g",
      launcherId: "yfs",
      settings: { metrics: true, bgmVolume: 7 },
      env: { KORRI_YFS_SETTINGS: "{settings}" },
    })
    const spec = run(composeLaunchSpec(l, ctx))
    expect(JSON.parse(spec.env?.KORRI_YFS_SETTINGS ?? "{}")).toEqual({
      metrics: true,
      bgmVolume: 7,
    })
  })

  it("threads cwd through to the LaunchSpec", () => {
    const l = launcher({ id: "x" })
    const ctx = context({
      gameId: "g",
      launcherId: "x",
      cwd: "/storage/roms",
    })
    const spec = run(composeLaunchSpec(l, ctx))
    expect(spec.cwd).toBe("/storage/roms")
  })
})

describe("composeReadableLaunchSpec — args / env", () => {
  it("substitutes readable app settings into env values", () => {
    const ctx = readableContext({
      app: {
        id: "@korri:yoshis-fabrication-station/level",
        command: "yfs-launch",
        args: ["{target}"],
        env: { KORRI_YFS_SETTINGS: "{settings.plugin}" },
      } as AppRecord,
      settings: { plugin: { metrics: true, bgmVolume: 7 } },
    })

    const spec = run(composeReadableLaunchSpec(ctx.app, ctx))

    expect(spec.args).toEqual(["/storage/levels/level.json"])
    expect(JSON.parse(spec.env?.KORRI_YFS_SETTINGS ?? "{}")).toEqual({
      metrics: true,
      bgmVolume: 7,
    })
  })
})

describe("composeLaunchSpec — errors", () => {
  it("MissingRequiredValue when {core} is referenced and not provided", () => {
    const l = launcher({
      id: "retroarch",
      command: "/usr/bin/retroarch",
      args: ["-L", "{core}", "{contentPath}"],
    })
    const ctx = context({ gameId: "g", launcherId: "retroarch" })
    expect(runErrTag(composeLaunchSpec(l, ctx))).toBe("MissingRequiredValue")
  })

  it("UnresolvedPlaceholder for an unknown placeholder like {foo}", () => {
    const l = launcher({
      id: "x",
      command: "/usr/bin/x",
      args: ["--what={foo}"],
    })
    const ctx = context({ gameId: "g", launcherId: "x" })
    expect(runErrTag(composeLaunchSpec(l, ctx))).toBe("UnresolvedPlaceholder")
  })

  it("DisallowedCommand when policy.allowedCommands does not include the launcher's command", () => {
    const l = launcher({
      id: "x",
      command: "/usr/bin/dangerous",
      args: [],
      policy: { allowedCommands: ["/usr/bin/safe-1", "/usr/bin/safe-2"] },
    })
    const ctx = context({ gameId: "g", launcherId: "x" })
    expect(runErrTag(composeLaunchSpec(l, ctx))).toBe("DisallowedCommand")
  })

  it("succeeds when policy.allowedCommands includes the launcher's command", () => {
    const l = launcher({
      id: "x",
      command: "/usr/bin/safe-1",
      args: [],
      policy: { allowedCommands: ["/usr/bin/safe-1", "/usr/bin/safe-2"] },
    })
    const ctx = context({ gameId: "g", launcherId: "x" })
    const spec = run(composeLaunchSpec(l, ctx))
    expect(spec.command).toBe("/usr/bin/safe-1")
  })
})
