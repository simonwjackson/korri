import { describe, expect, it } from "bun:test"

import { composeGamescopeLaunchSpec } from "./gamescope-launch-spec"

const game = {
  command: "retroarch",
  args: ["-L", "mgba", "mario.gba"],
} as const

describe("composeGamescopeLaunchSpec", () => {
  it("returns the game unchanged when gamescope is disabled", () => {
    const spec = composeGamescopeLaunchSpec(game, { enabled: false })
    expect(spec).toEqual(game)
  })

  it("wraps the game in gamescope with a -- separator", () => {
    const spec = composeGamescopeLaunchSpec(game, {
      enabled: true,
      backend: "wayland",
      exposeWayland: true,
    })
    expect(spec.command).toBe("gamescope")
    const sep = spec.args.indexOf("--")
    expect(sep).toBeGreaterThanOrEqual(0)
    expect(spec.args.slice(sep + 1)).toEqual([
      "retroarch",
      "-L",
      "mgba",
      "mario.gba",
    ])
  })

  it("does NOT clear WAYLAND_DISPLAY by default (native-Wayland path)", () => {
    const spec = composeGamescopeLaunchSpec(game, { enabled: true })
    expect(spec.args).not.toContain("WAYLAND_DISPLAY")
  })

  it("routes the game through Xwayland when forceXwayland is set", () => {
    const spec = composeGamescopeLaunchSpec(game, {
      enabled: true,
      forceXwayland: true,
    })
    const sep = spec.args.indexOf("--")
    // Inner command becomes `env -u WAYLAND_DISPLAY retroarch ...`
    expect(spec.args.slice(sep + 1)).toEqual([
      "env",
      "-u",
      "WAYLAND_DISPLAY",
      "retroarch",
      "-L",
      "mgba",
      "mario.gba",
    ])
  })

  it("ignores forceXwayland when gamescope is disabled", () => {
    const spec = composeGamescopeLaunchSpec(game, {
      enabled: false,
      forceXwayland: true,
    })
    expect(spec).toEqual(game)
  })
})
