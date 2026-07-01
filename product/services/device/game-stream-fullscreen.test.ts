import { describe, expect, it } from "bun:test"
import {
  buildStreamSurfaceRepairCommands,
  findStreamSurfaceWindows,
  probeSwayTree,
  readCurrentStreamSurfaceGeometry,
  repairStreamSurface,
  waitForStreamSurface,
  waitForStreamSurfaceAbsence,
} from "./game-stream-fullscreen"
import type { SwayNode } from "./sessiond-sway"

const emptyTree: SwayNode = { id: 1, nodes: [] }
const streamSurfaceSelector = {
  appIds: ["stream-surface"],
  titles: ["stream-surface"],
  classes: ["stream-surface", "StreamSurface"],
}
const streamSurfaceTree: SwayNode = {
  id: 1,
  nodes: [
    {
      id: 2,
      nodes: [
        {
          id: 42,
          app_id: "stream-surface",
          focused: false,
          fullscreen_mode: 0,
          name: "stream-surface",
          window_properties: {
            title: "[weird]; title",
            class: "StreamSurface",
          },
        },
      ],
    },
  ],
}

describe("stream surface discovery and repair", () => {
  it("finds stream surface windows without interpolating title criteria", () => {
    expect(
      findStreamSurfaceWindows(streamSurfaceTree, streamSurfaceSelector),
    ).toEqual([
      {
        id: 42,
        focused: false,
        fullscreen: false,
        appId: "stream-surface",
        title: "[weird]; title",
        className: "StreamSurface",
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

  it("default discovery ignores named non-window containers", () => {
    const tree: SwayNode = {
      id: 1,
      type: "root",
      name: "root",
      nodes: [
        {
          id: 2,
          type: "workspace",
          name: "workspace-1",
          nodes: [
            {
              id: 3,
              app_id: "gamescope",
              focused: true,
              fullscreen_mode: 1,
              name: "Neverball 1.6.0",
            },
          ],
        },
      ],
    }

    expect(findStreamSurfaceWindows(tree, {})).toEqual([
      {
        id: 3,
        focused: true,
        fullscreen: true,
        appId: "gamescope",
        title: "Neverball 1.6.0",
        className: null,
      },
    ])
  })

  it("preserves stream surface and containing output rects", () => {
    const tree: SwayNode = {
      id: 1,
      type: "root",
      nodes: [
        {
          id: 2,
          type: "output",
          name: "DSI-1",
          rect: { x: 0, y: 0, width: 1920, height: 1080 },
          nodes: [
            {
              id: 42,
              app_id: "stream-surface",
              focused: true,
              fullscreen_mode: 0,
              rect: { x: 960, y: 0, width: 960, height: 1080 },
            },
          ],
        },
      ],
    }

    expect(findStreamSurfaceWindows(tree, streamSurfaceSelector)).toEqual([
      expect.objectContaining({
        id: 42,
        rect: { x: 960, y: 0, width: 960, height: 1080 },
        output: {
          id: 2,
          name: "DSI-1",
          rect: { x: 0, y: 0, width: 1920, height: 1080 },
        },
      }),
    ])
  })

  it("reads current stream geometry repeatedly for polling coordinators", async () => {
    const firstTree: SwayNode = {
      id: 1,
      nodes: [
        {
          id: 2,
          type: "output",
          name: "DSI-1",
          rect: { x: 0, y: 0, width: 1920, height: 1080 },
          nodes: [
            {
              id: 42,
              app_id: "stream-surface",
              focused: true,
              fullscreen_mode: 0,
              rect: { x: 0, y: 0, width: 960, height: 1080 },
            },
          ],
        },
      ],
    }
    const secondTree: SwayNode = {
      ...firstTree,
      nodes: [
        {
          id: 2,
          type: "output",
          name: "DSI-1",
          rect: { x: 0, y: 0, width: 1920, height: 1080 },
          nodes: [
            {
              id: 42,
              app_id: "stream-surface",
              focused: true,
              fullscreen_mode: 0,
              rect: { x: 960, y: 0, width: 960, height: 1080 },
            },
          ],
        },
      ],
    }
    const trees = [firstTree, secondTree]

    const runner = {
      run: async () => JSON.stringify(trees.shift() ?? secondTree),
    }

    const first = await readCurrentStreamSurfaceGeometry({
      runner,
      selector: { appIds: ["stream-surface"] },
    })
    const second = await readCurrentStreamSurfaceGeometry({
      runner,
      selector: { appIds: ["stream-surface"] },
    })

    expect(first.status).toBe("available")
    expect(second.status).toBe("available")
    if (first.status === "available" && second.status === "available") {
      expect(first.surface.rect?.x).toBe(0)
      expect(second.surface.rect?.x).toBe(960)
    }
  })

  it("waits for a stream surface before repairing it", async () => {
    const calls: readonly string[][] = []
    const mutableCalls: string[][] = calls as string[][]
    const trees = [emptyTree, streamSurfaceTree]
    let time = 0

    const surface = await waitForStreamSurface({
      selector: { appIds: ["stream-surface"] },
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
            return JSON.stringify(trees.shift() ?? streamSurfaceTree)
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
      selector: { appIds: ["stream-surface"] },
      runner: {
        run: async args => {
          calls.push([...args])
          if (args.includes("get_tree"))
            return JSON.stringify(streamSurfaceTree)
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

  it("retries when a transient stream surface disappears during repair", async () => {
    let time = 0
    const calls: string[][] = []
    const treeWithFirstSurface: SwayNode = {
      id: 1,
      nodes: [
        {
          id: 2,
          nodes: [
            {
              id: 42,
              app_id: "stream-surface",
              focused: false,
              fullscreen_mode: 0,
            },
          ],
        },
      ],
    }
    const treeWithReplacementSurface: SwayNode = {
      id: 1,
      nodes: [
        {
          id: 2,
          nodes: [
            {
              id: 43,
              app_id: "stream-surface",
              focused: false,
              fullscreen_mode: 0,
            },
          ],
        },
      ],
    }
    let treeReads = 0

    const result = await repairStreamSurface({
      selector: { appIds: ["stream-surface"] },
      pollMs: 1,
      now: () => time,
      sleep: async durationMs => {
        time += durationMs
      },
      runner: {
        run: async args => {
          calls.push([...args])
          if (args.includes("get_tree")) {
            treeReads += 1
            return JSON.stringify(
              treeReads === 1 ? treeWithFirstSurface : treeWithReplacementSurface,
            )
          }
          if (args[0]?.includes("con_id=42")) {
            throw new Error("No matching node.")
          }
          return ""
        },
      },
    })

    expect(result.windowId).toBe(43)
    expect(calls).toContainEqual(["[con_id=42] focus"])
    expect(calls).toContainEqual(["[con_id=43] focus"])
    expect(result.commands).toContain("[con_id=43] border none")
  })

  it("treats persistent no-matching-node repair races as best effort", async () => {
    let time = 0
    const calls: string[][] = []

    const result = await repairStreamSurface({
      selector: { appIds: ["stream-surface"] },
      timeoutMs: 2,
      pollMs: 1,
      now: () => time,
      sleep: async durationMs => {
        time += durationMs
      },
      runner: {
        run: async args => {
          calls.push([...args])
          if (args.includes("get_tree")) return JSON.stringify(streamSurfaceTree)
          throw new Error('"error": "No matching node."')
        },
      },
    })

    expect(result.windowId).toBe(42)
    expect(result.commands).toContain("[con_id=42] focus")
    expect(calls.filter(call => call.includes("get_tree")).length).toBeGreaterThan(1)
  })

  it("ignores pre-existing stream surfaces while waiting for a new one", async () => {
    const calls: string[][] = []
    const treeWithOldAndNew: SwayNode = {
      id: 1,
      nodes: [
        {
          id: 2,
          nodes: [
            {
              id: 42,
              app_id: "stream-surface",
              focused: true,
              fullscreen_mode: 1,
            },
            {
              id: 43,
              app_id: "stream-surface",
              focused: false,
              fullscreen_mode: 0,
            },
          ],
        },
      ],
    }

    const result = await repairStreamSurface({
      selector: { appIds: ["stream-surface"] },
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

  it("can repair nameless stream surface surfaces observed on Sobo", async () => {
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
            {
              id: 42,
              app_id: "stream-surface",
              focused: true,
              fullscreen_mode: 1,
            },
            {
              id: 43,
              app_id: "stream-surface",
              focused: false,
              fullscreen_mode: 1,
            },
            {
              id: 44,
              app_id: "stream-surface",
              focused: false,
              fullscreen_mode: 1,
            },
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
            {
              id: 42,
              app_id: "stream-surface",
              focused: true,
              fullscreen_mode: 1,
            },
          ],
        },
      ],
    }
    const trees = [treeWithOwnedSurfaces, treeWithIgnoredOnly]
    let time = 0

    const result = await waitForStreamSurfaceAbsence({
      selector: { appIds: ["stream-surface"] },
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
            {
              id: 42,
              app_id: "stream-surface",
              focused: true,
              fullscreen_mode: 1,
            },
            {
              id: 44,
              app_id: "stream-surface",
              focused: false,
              fullscreen_mode: 1,
            },
          ],
        },
      ],
    }
    let time = 0

    await expect(
      waitForStreamSurfaceAbsence({
        selector: { appIds: ["stream-surface"] },
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
      selector: { appIds: ["stream-surface"] },
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
          return JSON.stringify(streamSurfaceTree)
        },
      },
    })

    expect(result.status).toBe("cancelled")
    expect(polls).toBe(1)
  })

  it("records empty owned stream surface absence deterministically", async () => {
    const result = await waitForStreamSurfaceAbsence({
      selector: { appIds: ["stream-surface"] },
      ownedWindowIds: new Set(),
      runner: { run: async () => JSON.stringify(streamSurfaceTree) },
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
        runner: { run: async () => JSON.stringify(streamSurfaceTree) },
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
        selector: { appIds: ["stream-surface"] },
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
