import { describe, expect, it } from "bun:test"
import {
  createKorriLaneController,
  type KorriLaneSnapshot,
} from "./sessiond-lanes"
import type { SwayNode } from "./sessiond-sway"

const HUB = "korri:hub"
const GAME = "korri:game:active"

function makeController() {
  const calls: string[][] = []
  const mutableCalls = calls
  const trees: SwayNode[] = []
  const controller = createKorriLaneController({
    lanes: { hub: HUB, game: GAME },
    runner: {
      run: async args => {
        mutableCalls.push([...args])
        if (args.includes("get_tree"))
          return JSON.stringify(trees.shift() ?? {})
        return ""
      },
    },
  })
  return { controller, calls, trees }
}

function snapshot(
  controller: ReturnType<typeof createKorriLaneController>,
): KorriLaneSnapshot {
  return controller.snapshot()
}

describe("Korri workspace lane controller", () => {
  it("promotes a new game window after launch intent without focusing an empty lane first", async () => {
    const { controller, calls, trees } = makeController()
    trees.push(
      treeWithWindow({
        id: 42,
        workspace: GAME,
        focused: true,
        fullscreen: true,
      }),
    )

    controller.beginLaunch({
      launchId: "launch-1",
      ignoredWindowIds: new Set([10]),
    })
    expect(snapshot(controller).game.status).toBe("pending")
    expect(calls).toEqual([])

    await controller.handleSwayEvent({
      kind: "window",
      change: "new",
      container: { id: 42, name: "Game" },
    })

    expect(snapshot(controller)).toMatchObject({
      activePlace: "game",
      game: { status: "live-active", windowId: 42 },
    })
    expect(calls).toEqual([
      [`[con_id=42] move container to workspace ${JSON.stringify(GAME)}`],
      [`[con_id=42] fullscreen enable`],
      [`workspace ${JSON.stringify(GAME)}`],
      ["-t", "get_tree"],
    ])
  })

  it("ignores baseline windows when matching a pending launch", async () => {
    const { controller, calls } = makeController()
    controller.beginLaunch({
      launchId: "launch-1",
      ignoredWindowIds: new Set([10]),
    })

    await controller.handleSwayEvent({
      kind: "window",
      change: "new",
      container: { id: 10, name: "Hub" },
    })

    expect(snapshot(controller).game.status).toBe("pending")
    expect(calls).toEqual([])
  })

  it("toggles Home from active game to hub and back to a live game", async () => {
    const { controller, calls, trees } = makeController()
    trees.push(
      treeWithWindow({
        id: 42,
        workspace: GAME,
        focused: true,
        fullscreen: true,
      }),
    )
    controller.beginLaunch({ launchId: "launch-1" })
    await controller.handleSwayEvent({
      kind: "window",
      change: "new",
      container: { id: 42 },
    })
    calls.length = 0

    expect(await controller.toggleHome()).toEqual({ status: "focused-hub" })
    expect(snapshot(controller)).toMatchObject({
      activePlace: "hub",
      game: { status: "live-backgrounded" },
    })
    trees.push(
      treeWithWindow({
        id: 42,
        workspace: GAME,
        focused: false,
        fullscreen: true,
      }),
    )

    expect(await controller.toggleHome()).toEqual({ status: "focused-game" })
    expect(snapshot(controller)).toMatchObject({
      activePlace: "game",
      game: { status: "live-active" },
    })
    expect(calls).toEqual([
      [`workspace ${JSON.stringify(HUB)}`],
      ["-t", "get_tree"],
      [`workspace ${JSON.stringify(GAME)}`],
    ])
  })

  it("fails closed to hub when cached game state is stale", async () => {
    const { controller, calls, trees } = makeController()
    trees.push(
      treeWithWindow({
        id: 42,
        workspace: GAME,
        focused: true,
        fullscreen: true,
      }),
    )
    controller.beginLaunch({ launchId: "launch-1" })
    await controller.handleSwayEvent({
      kind: "window",
      change: "new",
      container: { id: 42 },
    })
    await controller.toggleHome()
    calls.length = 0
    trees.push({ id: 1, type: "root", nodes: [] })

    expect(await controller.toggleHome()).toEqual({ status: "no-live-game" })
    expect(snapshot(controller)).toMatchObject({
      activePlace: "hub",
      game: { status: "exited" },
    })
    expect(calls).toEqual([
      ["-t", "get_tree"],
      [`workspace ${JSON.stringify(HUB)}`],
    ])
  })

  it("fails closed to hub when Home is pressed without a live game", async () => {
    const { controller, calls } = makeController()

    expect(await controller.toggleHome()).toEqual({ status: "no-live-game" })
    expect(snapshot(controller).activePlace).toBe("hub")
    expect(calls).toEqual([[`workspace ${JSON.stringify(HUB)}`]])
  })

  it("marks the game exited and focuses hub when the game workspace empties", async () => {
    const { controller, calls, trees } = makeController()
    trees.push(
      treeWithWindow({
        id: 42,
        workspace: GAME,
        focused: true,
        fullscreen: true,
      }),
    )
    controller.beginLaunch({ launchId: "launch-1" })
    await controller.handleSwayEvent({
      kind: "window",
      change: "new",
      container: { id: 42 },
    })
    calls.length = 0

    await controller.handleSwayEvent({
      kind: "workspace",
      change: "empty",
      current: { id: 2, name: GAME },
    })

    expect(snapshot(controller)).toMatchObject({
      activePlace: "hub",
      game: { status: "exited" },
    })
    expect(calls).toEqual([[`workspace ${JSON.stringify(HUB)}`]])
  })

  it("times out pending launches by returning to hub without creating a running lane", async () => {
    const { controller, calls } = makeController()
    controller.beginLaunch({ launchId: "launch-1" })

    await controller.noteLaunchTimeout("launch-1")

    expect(snapshot(controller)).toMatchObject({
      activePlace: "hub",
      game: { status: "failed" },
    })
    expect(calls).toEqual([[`workspace ${JSON.stringify(HUB)}`]])
  })
})

function treeWithWindow(input: {
  readonly id: number
  readonly workspace: string
  readonly focused: boolean
  readonly fullscreen: boolean
}): SwayNode {
  return {
    id: 1,
    type: "root",
    nodes: [
      {
        id: 2,
        type: "workspace",
        name: input.workspace,
        nodes: [
          {
            id: input.id,
            app_id: "game",
            focused: input.focused,
            fullscreen_mode: input.fullscreen ? 1 : 0,
          },
        ],
      },
    ],
  }
}
