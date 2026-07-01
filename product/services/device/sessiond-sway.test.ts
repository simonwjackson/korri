import { describe, expect, it } from "bun:test"
import {
  buildSwayCommandsForDecisions,
  createSwayController,
  findKorriWindows,
  parseSwayWindowEvent,
  type SwayNode,
} from "./sessiond-sway"

const tree: SwayNode = {
  id: 1,
  nodes: [
    {
      id: 2,
      name: "workspace",
      nodes: [
        {
          id: 10,
          app_id: "chrome-127.0.0.1__-Default",
          name: "Starter App",
          focused: false,
          fullscreen_mode: 0,
          window_properties: { title: "Starter App", class: null },
        },
        {
          id: 11,
          app_id: "foot",
          name: "terminal",
          focused: true,
          fullscreen_mode: 0,
          window_properties: { title: "terminal", class: "foot" },
        },
      ],
    },
  ],
}

describe("sway window discovery", () => {
  it("finds Chromium app-mode Korri windows by default app id prefix", () => {
    expect(findKorriWindows(tree)).toEqual([
      {
        id: 10,
        focused: false,
        fullscreen: false,
        appId: "chrome-127.0.0.1__-Default",
        title: "Starter App",
      },
    ])
  })

  it("finds Chromium browser windows by exact app id/class", () => {
    const windows = findKorriWindows({
      id: 1,
      nodes: [
        {
          id: 20,
          app_id: "chromium",
          focused: true,
          fullscreen_mode: 1,
          window_properties: { title: "Starter App", class: "Chromium" },
        },
      ],
    })

    expect(windows).toEqual([
      {
        id: 20,
        focused: true,
        fullscreen: true,
        appId: "chromium",
        title: "Starter App",
      },
    ])
  })

  it("returns no windows when selectors do not match", () => {
    expect(
      findKorriWindows(tree, {
        appIds: ["not-chromium"],
        appIdPrefixes: ["not-chrome-"],
        titles: ["Not Korri"],
        classes: ["Other"],
      }),
    ).toEqual([])
  })

  it("parses Sway window events for event-driven reconciliation", () => {
    const event = parseSwayWindowEvent(
      JSON.stringify({ change: "focus", container: { id: 44, name: "Korri" } }),
    )

    expect(event?.id).toBe(44)
  })
})

describe("sway repair commands", () => {
  it("builds focus/fullscreen/border repairs for a window", () => {
    expect(
      buildSwayCommandsForDecisions([
        {
          kind: "repair-window",
          windowId: 10,
          repairs: ["focus", "fullscreen"],
        },
      ]),
    ).toEqual([
      "[con_id=10] focus",
      "[con_id=10] fullscreen enable",
      "[con_id=10] border none",
    ])
  })

  it("builds duplicate cleanup commands before focusing the primary", () => {
    expect(
      buildSwayCommandsForDecisions([
        {
          kind: "close-duplicate-windows",
          primaryWindowId: 10,
          duplicateWindowIds: [12, 13],
        },
      ]),
    ).toEqual(["[con_id=12] kill", "[con_id=13] kill", "[con_id=10] focus"])
  })

  it("does not emit commands for noop or relaunch decisions", () => {
    expect(
      buildSwayCommandsForDecisions([
        { kind: "noop", primaryWindowId: 10 },
        { kind: "relaunch-renderer", reason: "missing-window" },
      ]),
    ).toEqual([])
  })
})

describe("sway controller", () => {
  it("moves windows to a named workspace through the runner", async () => {
    const calls: string[][] = []
    const controller = createSwayController({
      runner: {
        run: async args => {
          calls.push([...args])
          return ""
        },
      },
    })

    await expect(
      controller.placeWindowsOnWorkspace?.([10, 11], "korri:hub"),
    ).resolves.toEqual([
      '[con_id=10] move container to workspace "korri:hub"',
      '[con_id=11] move container to workspace "korri:hub"',
    ])
    expect(calls).toEqual([
      ['[con_id=10] move container to workspace "korri:hub"'],
      ['[con_id=11] move container to workspace "korri:hub"'],
    ])
  })

  it("reads the tree through the runner and applies repair commands", async () => {
    const calls: readonly string[][] = []
    const mutableCalls: string[][] = calls as string[][]
    const controller = createSwayController({
      runner: {
        run: async args => {
          mutableCalls.push([...args])
          if (args.includes("get_tree")) return JSON.stringify(tree)
          return ""
        },
      },
    })

    expect(await controller.getKorriWindows()).toHaveLength(1)
    const commands = await controller.applyDecisions([
      {
        kind: "repair-window",
        windowId: 10,
        repairs: ["fullscreen"],
      },
    ])

    expect(commands).toEqual([
      "[con_id=10] fullscreen enable",
      "[con_id=10] border none",
    ])
    expect(calls).toContainEqual(["-t", "get_tree"])
    expect(calls).toContainEqual(["[con_id=10] fullscreen enable"])
  })
})
