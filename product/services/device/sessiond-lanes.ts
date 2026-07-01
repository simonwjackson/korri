import type { SessiondSwayEvent } from "./sessiond-sway-events"
import type { SwayCommandRunner, SwayNode } from "./sessiond-sway"

export interface KorriLaneNames {
  readonly hub: string
  readonly game: string
}

export type KorriActivePlace = "hub" | "game" | "unknown"
export type KorriGameLaneStatus =
  | "none"
  | "pending"
  | "live-backgrounded"
  | "live-active"
  | "exited"
  | "failed"

export interface KorriLaneSnapshot {
  readonly lanes: KorriLaneNames
  readonly activePlace: KorriActivePlace
  readonly hub: { readonly present: boolean }
  readonly game: {
    readonly status: KorriGameLaneStatus
    readonly launchId?: string
    readonly windowId?: number
  }
  readonly generation: number
}

export type KorriLaneToggleResult =
  | { readonly status: "focused-hub" }
  | { readonly status: "focused-game" }
  | { readonly status: "no-live-game" }

export interface KorriLaneController {
  readonly snapshot: () => KorriLaneSnapshot
  readonly beginLaunch: (input: {
    readonly launchId: string
    readonly ignoredWindowIds?: ReadonlySet<number>
  }) => void
  readonly handleSwayEvent: (event: SessiondSwayEvent) => Promise<void>
  readonly toggleHome: () => Promise<KorriLaneToggleResult>
  readonly noteLaunchTimeout: (launchId: string) => Promise<void>
  readonly focusHub: () => Promise<void>
}

export function createKorriLaneController(options: {
  readonly lanes?: Partial<KorriLaneNames>
  readonly runner: SwayCommandRunner
}): KorriLaneController {
  const lanes: KorriLaneNames = {
    hub: options.lanes?.hub ?? "korri:hub",
    game: options.lanes?.game ?? "korri:game:active",
  }
  let activePlace: KorriActivePlace = "hub"
  let hubPresent = true
  let gameStatus: KorriGameLaneStatus = "none"
  let gameWindowId: number | undefined
  let launchId: string | undefined
  let generation = 0
  let ignoredWindowIds: ReadonlySet<number> = new Set()

  const controller: KorriLaneController = {
    snapshot: () => ({
      lanes,
      activePlace,
      hub: { present: hubPresent },
      game: {
        status: gameStatus,
        ...(launchId ? { launchId } : {}),
        ...(gameWindowId !== undefined ? { windowId: gameWindowId } : {}),
      },
      generation,
    }),

    beginLaunch(input) {
      generation += 1
      launchId = input.launchId
      ignoredWindowIds = input.ignoredWindowIds ?? new Set()
      gameWindowId = undefined
      gameStatus = "pending"
    },

    async handleSwayEvent(event) {
      if (event.kind === "window") {
        await handleWindowEvent(event)
        return
      }
      await handleWorkspaceEvent(event)
    },

    async toggleHome() {
      if (activePlace === "game" && isLiveGame()) {
        await focusWorkspace(lanes.hub)
        activePlace = "hub"
        gameStatus = "live-backgrounded"
        return { status: "focused-hub" }
      }

      if (activePlace === "hub" && isLiveGame()) {
        await focusWorkspace(lanes.game)
        activePlace = "game"
        gameStatus = "live-active"
        return { status: "focused-game" }
      }

      await focusHubInternal()
      return { status: "no-live-game" }
    },

    async noteLaunchTimeout(inputLaunchId) {
      if (inputLaunchId !== launchId || gameStatus !== "pending") return
      gameStatus = "failed"
      activePlace = "hub"
      await focusHubInternal()
    },

    async focusHub() {
      await focusHubInternal()
    },
  }

  async function handleWindowEvent(
    event: Extract<SessiondSwayEvent, { readonly kind: "window" }>,
  ) {
    const windowId = event.container.id
    if (windowId === undefined) return

    if (event.change === "close" && windowId === gameWindowId) {
      gameStatus = "exited"
      gameWindowId = undefined
      activePlace = "hub"
      await focusHubInternal()
      return
    }

    if (gameStatus !== "pending") return
    if (ignoredWindowIds.has(windowId)) return
    if (event.change && event.change !== "new") return

    gameWindowId = windowId
    await placeGameWindow(windowId)
    gameStatus = "live-active"
    activePlace = "game"
  }

  async function handleWorkspaceEvent(
    event: Extract<SessiondSwayEvent, { readonly kind: "workspace" }>,
  ) {
    if (event.change === "focus") {
      if (event.current?.name === lanes.hub) activePlace = "hub"
      if (event.current?.name === lanes.game && isLiveGame()) {
        activePlace = "game"
        gameStatus = "live-active"
      }
      return
    }

    if (event.change !== "empty") return
    if (event.current?.name !== lanes.game) return
    if (!isLiveGame()) return
    gameStatus = "exited"
    gameWindowId = undefined
    activePlace = "hub"
    await focusHubInternal()
  }

  async function placeGameWindow(windowId: number) {
    await options.runner.run([
      `[con_id=${windowId}] move container to workspace ${JSON.stringify(lanes.game)}`,
    ])
    await options.runner.run([`[con_id=${windowId}] fullscreen enable`])
    await focusWorkspace(lanes.game)
    await validateGamePlacement(windowId)
  }

  async function validateGamePlacement(windowId: number) {
    const raw = await options.runner.run(["-t", "get_tree"])
    const tree = JSON.parse(raw) as SwayNode
    const found = findWindowInWorkspace(tree, windowId, lanes.game)
    if (!found) throw new Error("game lane placement was not observed")
    if (!found.focused) throw new Error("game lane focus was not observed")
    if ((found.fullscreen_mode ?? 0) <= 0)
      throw new Error("game lane fullscreen was not observed")
  }

  async function focusHubInternal() {
    await focusWorkspace(lanes.hub)
    activePlace = "hub"
  }

  async function focusWorkspace(name: string) {
    await options.runner.run([`workspace ${JSON.stringify(name)}`])
  }

  function isLiveGame(): boolean {
    return (
      gameWindowId !== undefined &&
      (gameStatus === "live-active" || gameStatus === "live-backgrounded")
    )
  }

  return controller
}

function findWindowInWorkspace(
  node: SwayNode,
  windowId: number,
  workspaceName: string,
  currentWorkspace?: string | null,
): SwayNode | undefined {
  const nextWorkspace = node.type === "workspace" ? node.name : currentWorkspace
  if (node.id === windowId && nextWorkspace === workspaceName) return node
  for (const child of node.nodes ?? []) {
    const found = findWindowInWorkspace(
      child,
      windowId,
      workspaceName,
      nextWorkspace,
    )
    if (found) return found
  }
  for (const child of node.floating_nodes ?? []) {
    const found = findWindowInWorkspace(
      child,
      windowId,
      workspaceName,
      nextWorkspace,
    )
    if (found) return found
  }
  return undefined
}
