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
          app_id: "korri-desktop",
          name: "Korri",
          focused: false,
          fullscreen_mode: 0,
          window_properties: { title: "Korri", class: "Electrobun" },
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
  it("finds Korri Electrobun windows by app id/class", () => {
    expect(findKorriWindows(tree)).toEqual([
      {
        id: 10,
        focused: false,
        fullscreen: false,
        appId: "korri-desktop",
        title: "Korri",
      },
    ])
  })

  it("finds Korri Electrobun windows by Electrobun runtime class", () => {
    const windows = findKorriWindows({
      id: 1,
      nodes: [
        {
          id: 20,
          app_id: null,
          focused: true,
          fullscreen_mode: 1,
          window_properties: {
            title: "Korri",
            class: "ElectrobunKitchenSink-dev",
          },
        },
      ],
    })

    expect(windows).toEqual([
      {
        id: 20,
        focused: true,
        fullscreen: true,
        appId: null,
        title: "Korri",
      },
    ])
  })

  it("does not match legacy Chromium windows by default", () => {
    const windows = findKorriWindows({
      id: 1,
      nodes: [
        {
          id: 20,
          app_id: "chromium",
          focused: true,
          fullscreen_mode: 1,
          window_properties: { title: "Korri", class: "Chromium" },
        },
      ],
    })

    expect(windows).toEqual([])
  })

  it("matches Chromium app windows by configured app id prefix", () => {
    const windows = findKorriWindows(
      {
        id: 1,
        nodes: [
          {
            id: 20,
            app_id: "chrome-127.0.0.1__-Default",
            focused: true,
            fullscreen_mode: 1,
            window_properties: { title: "Starter App", class: null },
          },
        ],
      },
      { appIdPrefixes: ["chrome-"] },
    )

    expect(windows).toEqual([
      {
        id: 20,
        focused: true,
        fullscreen: true,
        appId: "chrome-127.0.0.1__-Default",
        title: "Starter App",
      },
    ])
  })

  it("returns no windows when selectors do not match", () => {
    expect(
      findKorriWindows(tree, {
        appIds: ["not-electrobun"],
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
