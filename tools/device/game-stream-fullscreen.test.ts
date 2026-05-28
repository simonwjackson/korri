import { describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@shared/library/launcher"
import {
  buildStreamSurfaceRepairCommands,
  composeGamescopeLaunchSpec,
  findStreamSurfaceWindows,
  probeSwayTree,
  repairStreamSurface,
  waitForStreamSurface,
  waitForStreamSurfaceAbsence,
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

  it("does not sniff the child env for Wayland intent", () => {
    // exposeWayland is now policy-driven only. A child with
    // SDL_VIDEODRIVER=wayland (or WAYLAND_DISPLAY, or -platform wayland)
    // does not magic-add --expose-wayland; the caller asks for it
    // explicitly via the policy field.
    expect(
      composeGamescopeLaunchSpec(
        { ...game, env: { SDL_VIDEODRIVER: "wayland" } },
        { enabled: true },
      ).args,
    ).toEqual([
      "-f",
      "-b",
      "--",
      "/nix/store/demo/bin/neverball",
      "--level",
      "one",
    ])
  })

  it("leaves the game command unchanged when Gamescope is disabled", () => {
    expect(composeGamescopeLaunchSpec(game, { enabled: false })).toBe(game)
  })

  it("adds --expose-wayland when the policy opts in", () => {
    expect(
      composeGamescopeLaunchSpec(game, {
        enabled: true,
        exposeWayland: true,
      }).args,
    ).toEqual([
      "-f",
      "-b",
      "--expose-wayland",
      "--",
      "/nix/store/demo/bin/neverball",
      "--level",
      "one",
    ])
  })

  it("prepends an explicit --backend flag when the policy selects one", () => {
    expect(
      composeGamescopeLaunchSpec(game, {
        enabled: true,
        backend: "wayland",
      }).args,
    ).toEqual([
      "--backend",
      "wayland",
      "-f",
      "-b",
      "--",
      "/nix/store/demo/bin/neverball",
      "--level",
      "one",
    ])
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

  it("can select any newly-created window for raw foreground launches", async () => {
    const treeWithOldAndNew: SwayNode = {
      id: 1,
      nodes: [
        {
          id: 2,
          nodes: [
            { id: 42, app_id: "firefox", focused: true, fullscreen_mode: 1 },
            { id: 43, app_id: "neverball", focused: false, fullscreen_mode: 0 },
          ],
        },
      ],
    }

    const result = await repairStreamSurface({
      selector: {},
      ignoredWindowIds: new Set([42]),
      runner: {
        run: async args =>
          args.includes("get_tree") ? JSON.stringify(treeWithOldAndNew) : "",
      },
    })

    expect(result.windowId).toBe(43)
    expect(result.commands).toContain("[con_id=43] fullscreen enable")
  })

  it("can repair nameless Gamescope surfaces observed on Sobo", async () => {
    const soboTree: SwayNode = {
      id: 1,
      nodes: [
        {
          id: 4,
          name: "1",
          nodes: [
            { id: 8, name: "Korri", focused: false, fullscreen_mode: 0 },
            { id: 10, app_id: null, focused: true, fullscreen_mode: 1 },
          ],
        },
      ],
    }

    const result = await repairStreamSurface({
      selector: {},
      ignoredWindowIds: new Set([1, 4, 8]),
      runner: {
        run: async args =>
          args.includes("get_tree") ? JSON.stringify(soboTree) : "",
      },
    })

    expect(result.windowId).toBe(10)
    expect(result.commands).toEqual(["[con_id=10] border none"])
  })

  it("waits for all owned stream surfaces to disappear while ignored surfaces remain", async () => {
    const treeWithOwnedSurfaces: SwayNode = {
      id: 1,
      nodes: [
        {
          id: 2,
          nodes: [
            { id: 42, app_id: "gamescope", focused: true, fullscreen_mode: 1 },
            { id: 43, app_id: "gamescope", focused: false, fullscreen_mode: 1 },
            { id: 44, app_id: "gamescope", focused: false, fullscreen_mode: 1 },
          ],
        },
      ],
    }
    const treeWithIgnoredOnly: SwayNode = {
      id: 1,
      nodes: [
        {
          id: 2,
          nodes: [
            { id: 42, app_id: "gamescope", focused: true, fullscreen_mode: 1 },
          ],
        },
      ],
    }
    const trees = [treeWithOwnedSurfaces, treeWithIgnoredOnly]
    let time = 0

    const result = await waitForStreamSurfaceAbsence({
      selector: { appIds: ["gamescope"] },
      ownedWindowIds: new Set([43, 44]),
      ignoredWindowIds: new Set([42]),
      timeoutMs: 1_000,
      pollMs: 100,
      now: () => time,
      sleep: async durationMs => {
        time += durationMs
      },
      runner: {
        run: async () => JSON.stringify(trees.shift() ?? treeWithIgnoredOnly),
      },
    })

    expect(result).toEqual({
      status: "absent",
      checkedWindowIds: [43, 44],
      remainingWindowIds: [],
    })
  })

  it("fails surface absence while any owned stream surface remains", async () => {
    const treeWithPartialOwnedSurfaces: SwayNode = {
      id: 1,
      nodes: [
        {
          id: 2,
          nodes: [
            { id: 42, app_id: "gamescope", focused: true, fullscreen_mode: 1 },
            { id: 44, app_id: "gamescope", focused: false, fullscreen_mode: 1 },
          ],
        },
      ],
    }
    let time = 0

    await expect(
      waitForStreamSurfaceAbsence({
        selector: { appIds: ["gamescope"] },
        ownedWindowIds: new Set([43, 44]),
        ignoredWindowIds: new Set([42]),
        timeoutMs: 100,
        pollMs: 50,
        now: () => time,
        sleep: async durationMs => {
          time += durationMs
        },
        runner: {
          run: async () => JSON.stringify(treeWithPartialOwnedSurfaces),
        },
      }),
    ).rejects.toMatchObject({
      message: "stream surface remained after timeout",
      remainingWindowIds: [44],
    })
  })

  it("cancels surface absence polling when the signal aborts", async () => {
    const controller = new AbortController()
    let time = 0
    let polls = 0

    const result = await waitForStreamSurfaceAbsence({
      selector: { appIds: ["gamescope"] },
      ownedWindowIds: new Set([42]),
      signal: controller.signal,
      timeoutMs: 1_000,
      pollMs: 50,
      now: () => time,
      sleep: async durationMs => {
        time += durationMs
        controller.abort()
      },
      runner: {
        run: async () => {
          polls += 1
          return JSON.stringify(gamescopeTree)
        },
      },
    })

    expect(result.status).toBe("cancelled")
    expect(polls).toBe(1)
  })

  it("records empty owned stream surface absence deterministically", async () => {
    const result = await waitForStreamSurfaceAbsence({
      selector: { appIds: ["gamescope"] },
      ownedWindowIds: new Set(),
      runner: { run: async () => JSON.stringify(gamescopeTree) },
    })

    expect(result).toEqual({
      status: "not-tracked",
      checkedWindowIds: [],
      remainingWindowIds: [],
    })
  })

  it("probes the Sway tree with structured success and failure evidence", async () => {
    await expect(
      probeSwayTree({
        runner: { run: async () => JSON.stringify(gamescopeTree) },
      }),
    ).resolves.toEqual({
      ok: true,
      surfaceCount: 1,
    })

    await expect(
      probeSwayTree({
        runner: { run: async () => "not-json" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("JSON"),
    })
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
