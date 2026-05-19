import { describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@shared/library/launcher"
import {
  buildStreamSurfaceRepairCommands,
  composeGamescopeLaunchSpec,
  findStreamSurfaceWindows,
  repairStreamSurface,
  waitForStreamSurface,
} from "./game-stream-fullscreen"
import type { SwayNode } from "./sessiond-sway"

const game: LaunchSpec = {
  command: "/nix/store/demo/bin/neverball",
  args: ["--level", "one"],
  env: { DEMO: "1" },
  cwd: "/tmp",
}

const emptyTree: SwayNode = { id: 1, nodes: [] }
const gamescopeTree: SwayNode = {
  id: 1,
  nodes: [
    {
      id: 2,
      nodes: [
        {
          id: 42,
          app_id: "gamescope",
          focused: false,
          fullscreen_mode: 0,
          name: "gamescope",
          window_properties: {
            title: "[weird]; title",
            class: "Gamescope",
          },
        },
      ],
    },
  ],
}

describe("gamescope launch composition", () => {
  it("wraps a configured game in fullscreen borderless Gamescope", () => {
    expect(
      composeGamescopeLaunchSpec(game, {
        enabled: true,
        command: "/nix/store/gamescope/bin/gamescope",
      }),
    ).toEqual({
      command: "/nix/store/gamescope/bin/gamescope",
      args: [
        "-f",
        "-b",
        "--",
        "/nix/store/demo/bin/neverball",
        "--level",
        "one",
      ],
      env: { DEMO: "1" },
      cwd: "/tmp",
    })
  })

  it("leaves the game command unchanged when Gamescope is disabled", () => {
    expect(composeGamescopeLaunchSpec(game, { enabled: false })).toBe(game)
  })
})

describe("stream surface discovery and repair", () => {
  it("finds Gamescope windows without interpolating title criteria", () => {
    expect(findStreamSurfaceWindows(gamescopeTree)).toEqual([
      {
        id: 42,
        focused: false,
        fullscreen: false,
        appId: "gamescope",
        title: "[weird]; title",
        className: "Gamescope",
      },
    ])

    expect(
      buildStreamSurfaceRepairCommands({
        id: 42,
        focused: false,
        fullscreen: false,
      }),
    ).toEqual([
      "[con_id=42] focus",
      "[con_id=42] fullscreen enable",
      "[con_id=42] border none",
    ])
  })

  it("waits for a stream surface before repairing it", async () => {
    const calls: readonly string[][] = []
    const mutableCalls: string[][] = calls as string[][]
    const trees = [emptyTree, gamescopeTree]
    let time = 0

    const surface = await waitForStreamSurface({
      selector: { appIds: ["gamescope"] },
      timeoutMs: 1_000,
      pollMs: 100,
      now: () => time,
      sleep: async durationMs => {
        time += durationMs
      },
      runner: {
        run: async args => {
          mutableCalls.push([...args])
          if (args.includes("get_tree")) {
            return JSON.stringify(trees.shift() ?? gamescopeTree)
          }
          return ""
        },
      },
    })

    expect(surface.id).toBe(42)
    expect(calls.filter(call => call.includes("get_tree"))).toHaveLength(2)
  })

  it("repairs the selected stream surface by con_id", async () => {
    const calls: string[][] = []
    const result = await repairStreamSurface({
      selector: { appIds: ["gamescope"] },
      runner: {
        run: async args => {
          calls.push([...args])
          if (args.includes("get_tree")) return JSON.stringify(gamescopeTree)
          return ""
        },
      },
    })

    expect(result).toEqual({
      windowId: 42,
      commands: [
        "[con_id=42] focus",
        "[con_id=42] fullscreen enable",
        "[con_id=42] border none",
      ],
    })
    expect(calls).toContainEqual(["[con_id=42] fullscreen enable"])
  })

  it("ignores pre-existing stream surfaces while waiting for a new one", async () => {
    const calls: string[][] = []
    const treeWithOldAndNew: SwayNode = {
      id: 1,
      nodes: [
        {
          id: 2,
          nodes: [
            { id: 42, app_id: "gamescope", focused: true, fullscreen_mode: 1 },
            { id: 43, app_id: "gamescope", focused: false, fullscreen_mode: 0 },
          ],
        },
      ],
    }

    const result = await repairStreamSurface({
      selector: { appIds: ["gamescope"] },
      ignoredWindowIds: new Set([42]),
      runner: {
        run: async args => {
          calls.push([...args])
          if (args.includes("get_tree"))
            return JSON.stringify(treeWithOldAndNew)
          return ""
        },
      },
    })

    expect(result.windowId).toBe(43)
    expect(calls).toContainEqual(["[con_id=43] fullscreen enable"])
    expect(calls).not.toContainEqual(["[con_id=42] focus"])
  })

  it("times out when no stream surface appears", async () => {
    let time = 0

    await expect(
      waitForStreamSurface({
        selector: { appIds: ["gamescope"] },
        timeoutMs: 100,
        pollMs: 50,
        now: () => time,
        sleep: async durationMs => {
          time += durationMs
        },
        runner: { run: async () => JSON.stringify(emptyTree) },
      }),
    ).rejects.toThrow("stream surface did not appear")
  })
})
