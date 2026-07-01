import type {
  HomeInvariantDecision,
  KorriWindowSnapshot,
} from "./sessiond-state"

export interface SwayRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface SwayNode {
  readonly id?: number
  readonly name?: string | null
  readonly type?: string | null
  readonly app_id?: string | null
  readonly focused?: boolean
  readonly fullscreen_mode?: number
  readonly rect?: SwayRect
  readonly window_properties?: {
    readonly class?: string | null
    readonly title?: string | null
  }
  readonly nodes?: readonly SwayNode[]
  readonly floating_nodes?: readonly SwayNode[]
}

export interface SwayWindowSelector {
  readonly appIds?: readonly string[]
  readonly titles?: readonly string[]
  readonly classes?: readonly string[]
}

export interface SwayCommandRunner {
  run: (args: readonly string[]) => Promise<string>
}

export interface SwayController {
  getKorriWindows: () => Promise<readonly KorriWindowSnapshot[]>
  applyDecisions: (
    decisions: readonly HomeInvariantDecision[],
  ) => Promise<readonly string[]>
}

export const DEFAULT_SWAY_SELECTOR: Required<SwayWindowSelector> = {
  appIds: ["korri-desktop", "dev.korri.desktop"],
  titles: [],
  classes: ["Korri", "Electrobun", "ElectrobunKitchenSink-dev"],
}

export function findKorriWindows(
  tree: SwayNode,
  selector: SwayWindowSelector = DEFAULT_SWAY_SELECTOR,
): readonly KorriWindowSnapshot[] {
  const windows: KorriWindowSnapshot[] = []
  walkSwayTree(tree, node => {
    if (node.id === undefined) return
    if (!matchesSelector(node, selector)) return

    windows.push({
      id: node.id,
      focused: node.focused === true,
      fullscreen: (node.fullscreen_mode ?? 0) > 0,
      appId: node.app_id ?? null,
      title: node.window_properties?.title ?? node.name ?? null,
    })
  })
  return windows
}

export function buildSwayCommandsForDecisions(
  decisions: readonly HomeInvariantDecision[],
): readonly string[] {
  const commands: string[] = []

  for (const decision of decisions) {
    switch (decision.kind) {
      case "noop":
      case "relaunch-renderer":
        break
      case "close-duplicate-windows":
        for (const windowId of decision.duplicateWindowIds) {
          commands.push(`[con_id=${windowId}] kill`)
        }
        commands.push(`[con_id=${decision.primaryWindowId}] focus`)
        break
      case "repair-window":
        if (decision.repairs.includes("focus")) {
          commands.push(`[con_id=${decision.windowId}] focus`)
        }
        if (decision.repairs.includes("fullscreen")) {
          commands.push(`[con_id=${decision.windowId}] fullscreen enable`)
        }
        commands.push(`[con_id=${decision.windowId}] border none`)
        break
    }
  }

  return commands
}

export function createSwayController(options: {
  readonly runner: SwayCommandRunner
  readonly selector?: SwayWindowSelector
}): SwayController {
  return {
    async getKorriWindows() {
      const raw = await options.runner.run(["-t", "get_tree"])
      return findKorriWindows(JSON.parse(raw), options.selector)
    },

    async applyDecisions(decisions) {
      const commands = buildSwayCommandsForDecisions(decisions)
      for (const command of commands) {
        await options.runner.run([command])
      }
      return commands
    },
  }
}

export function parseSwayWindowEvent(raw: string): SwayNode | undefined {
  const parsed = JSON.parse(raw) as { readonly container?: SwayNode }
  return parsed.container
}

export interface SwayWorkspaceEvent {
  readonly change?: string
  readonly current?: SwayNode
  readonly old?: SwayNode
}

export function parseSwayWorkspaceEvent(raw: string): SwayWorkspaceEvent {
  const parsed = JSON.parse(raw) as SwayWorkspaceEvent
  return parsed
}

function walkSwayTree(node: SwayNode, visit: (node: SwayNode) => void) {
  visit(node)
  for (const child of node.nodes ?? []) walkSwayTree(child, visit)
  for (const child of node.floating_nodes ?? []) walkSwayTree(child, visit)
}

function matchesSelector(
  node: SwayNode,
  selector: SwayWindowSelector,
): boolean {
  const appIds = selector.appIds ?? DEFAULT_SWAY_SELECTOR.appIds
  const titles = selector.titles ?? DEFAULT_SWAY_SELECTOR.titles
  const classes = selector.classes ?? DEFAULT_SWAY_SELECTOR.classes
  const title = node.window_properties?.title ?? node.name ?? ""
  const className = node.window_properties?.class ?? ""

  return (
    (node.app_id ? appIds.includes(node.app_id) : false) ||
    titles.includes(title) ||
    (className ? classes.includes(className) : false)
  )
}
