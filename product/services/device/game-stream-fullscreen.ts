export type { GamescopePolicy } from "@product/plugins/gamescope/launch-companion"
export { composeGamescopeLaunchSpec } from "@product/plugins/gamescope/launch-companion"

import type {
  SwayCommandRunner,
  SwayNode,
  SwayRect,
  SwayWindowSelector,
} from "./sessiond-sway"

export interface StreamSurfaceOutputSnapshot {
  readonly id: number
  readonly name?: string | null
  readonly rect: SwayRect
}

export interface StreamSurfaceSnapshot {
  readonly id: number
  readonly focused: boolean
  readonly fullscreen: boolean
  readonly appId?: string | null
  readonly title?: string | null
  readonly className?: string | null
  readonly rect?: SwayRect
  readonly output?: StreamSurfaceOutputSnapshot
}

export type CurrentStreamSurfaceGeometry =
  | {
      readonly status: "available"
      readonly surface: StreamSurfaceSnapshot & {
        readonly rect: SwayRect
        readonly output: StreamSurfaceOutputSnapshot
      }
    }
  | {
      readonly status: "missing-surface" | "missing-geometry"
      readonly surface?: StreamSurfaceSnapshot
    }

export interface StreamSurfaceRepairResult {
  readonly windowId: number
  readonly commands: readonly string[]
}

export interface WaitForStreamSurfaceOptions {
  readonly runner: SwayCommandRunner
  readonly selector: SwayWindowSelector
  readonly timeoutMs?: number
  readonly pollMs?: number
  readonly ignoredWindowIds?: ReadonlySet<number>
  readonly sleep?: (durationMs: number) => Promise<void>
  readonly now?: () => number
}

export interface RepairStreamSurfaceOptions
  extends WaitForStreamSurfaceOptions {}

export interface WaitForStreamSurfaceAbsenceOptions
  extends WaitForStreamSurfaceOptions {
  readonly ownedWindowIds: ReadonlySet<number>
  readonly signal?: AbortSignal
}

export interface StreamSurfaceAbsenceResult {
  readonly status: "absent" | "cancelled" | "not-tracked"
  readonly checkedWindowIds: readonly number[]
  readonly remainingWindowIds: readonly number[]
}

export interface SwayTreeProbeResult {
  readonly ok: boolean
  readonly surfaceCount?: number
  readonly message?: string
}

export class StreamSurfacePresenceTimeoutError extends Error {
  readonly remainingWindowIds: readonly number[]

  constructor(remainingWindowIds: readonly number[]) {
    super("stream surface remained after timeout")
    this.name = "StreamSurfacePresenceTimeoutError"
    this.remainingWindowIds = remainingWindowIds
  }
}

const DEFAULT_SURFACE_TIMEOUT_MS = 5_000
const DEFAULT_SURFACE_POLL_MS = 100

export const DEFAULT_GAMESCOPE_SELECTOR: SwayWindowSelector = {
  appIds: ["gamescope"],
  titles: ["gamescope"],
  classes: ["gamescope", "Gamescope"],
}

export function findStreamSurfaceWindows(
  tree: SwayNode,
  selector: SwayWindowSelector = DEFAULT_GAMESCOPE_SELECTOR,
): readonly StreamSurfaceSnapshot[] {
  const windows: StreamSurfaceSnapshot[] = []
  // fallow-ignore-next-line code-duplication
  walkSwayTreeWithOutput(tree, undefined, (node, output) => {
    if (node.id === undefined) return
    if (!matchesSelector(node, selector)) return

    windows.push({
      id: node.id,
      focused: node.focused === true,
      fullscreen: (node.fullscreen_mode ?? 0) > 0,
      appId: node.app_id ?? null,
      title: node.window_properties?.title ?? node.name ?? null,
      className: node.window_properties?.class ?? null,
      rect: node.rect,
      output,
    })
  })
  return windows
}

export async function readCurrentStreamSurfaceGeometry(options: {
  readonly runner: SwayCommandRunner
  readonly selector: SwayWindowSelector
  readonly ignoredWindowIds?: ReadonlySet<number>
}): Promise<CurrentStreamSurfaceGeometry> {
  const raw = await options.runner.run(["-t", "get_tree"])
  const surfaces = findStreamSurfaceWindows(
    JSON.parse(raw) as SwayNode,
    options.selector,
  ).filter(surface => !options.ignoredWindowIds?.has(surface.id))
  if (surfaces.length === 0) return { status: "missing-surface" }

  const surface = selectPrimarySurface(surfaces)
  if (!surface.rect || !surface.output) {
    return { status: "missing-geometry", surface }
  }

  return {
    status: "available",
    surface: {
      ...surface,
      rect: surface.rect,
      output: surface.output,
    },
  }
}

export function buildStreamSurfaceRepairCommands(
  surface: StreamSurfaceSnapshot,
): readonly string[] {
  const commands: string[] = []
  if (!surface.focused) commands.push(`[con_id=${surface.id}] focus`)
  if (!surface.fullscreen)
    commands.push(`[con_id=${surface.id}] fullscreen enable`)
  commands.push(`[con_id=${surface.id}] border none`)
  return commands
}

export async function waitForStreamSurface(
  options: WaitForStreamSurfaceOptions,
): Promise<StreamSurfaceSnapshot> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SURFACE_TIMEOUT_MS
  const pollMs = options.pollMs ?? DEFAULT_SURFACE_POLL_MS
  const now = options.now ?? (() => Date.now())
  const sleep = options.sleep ?? defaultSleep
  const deadline = now() + timeoutMs

  while (true) {
    const raw = await options.runner.run(["-t", "get_tree"])
    const surfaces = findStreamSurfaceWindows(
      JSON.parse(raw),
      options.selector,
    ).filter(surface => !options.ignoredWindowIds?.has(surface.id))
    if (surfaces.length > 0) return selectPrimarySurface(surfaces)

    if (now() >= deadline) {
      throw new Error("stream surface did not appear before timeout")
    }
    await sleep(pollMs)
  }
}

export async function snapshotStreamSurfaceIds(
  options: Pick<WaitForStreamSurfaceOptions, "runner" | "selector">,
): Promise<ReadonlySet<number>> {
  const raw = await options.runner.run(["-t", "get_tree"])
  return new Set(
    findStreamSurfaceWindows(JSON.parse(raw), options.selector).map(
      surface => surface.id,
    ),
  )
}

export async function waitForStreamSurfaceAbsence(
  options: WaitForStreamSurfaceAbsenceOptions,
): Promise<StreamSurfaceAbsenceResult> {
  const checkedWindowIds = sortedIds(options.ownedWindowIds)
  if (checkedWindowIds.length === 0) {
    return { status: "not-tracked", checkedWindowIds, remainingWindowIds: [] }
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_SURFACE_TIMEOUT_MS
  const pollMs = options.pollMs ?? DEFAULT_SURFACE_POLL_MS
  const now = options.now ?? (() => Date.now())
  const sleep = options.sleep ?? defaultSleep
  const deadline = now() + timeoutMs

  while (true) {
    if (options.signal?.aborted) {
      return {
        status: "cancelled",
        checkedWindowIds,
        remainingWindowIds: [],
      }
    }
    const remainingWindowIds = await remainingOwnedSurfaceIds(options)
    if (remainingWindowIds.length === 0) {
      return { status: "absent", checkedWindowIds, remainingWindowIds }
    }

    if (now() >= deadline) {
      throw new StreamSurfacePresenceTimeoutError(remainingWindowIds)
    }
    await sleep(pollMs)
    if (options.signal?.aborted) {
      return { status: "cancelled", checkedWindowIds, remainingWindowIds }
    }
  }
}

export async function probeSwayTree(options: {
  readonly runner: SwayCommandRunner
  readonly selector?: SwayWindowSelector
}): Promise<SwayTreeProbeResult> {
  try {
    const raw = await options.runner.run(["-t", "get_tree"])
    const tree = JSON.parse(raw) as SwayNode
    return {
      ok: true,
      surfaceCount: findStreamSurfaceWindows(tree, options.selector ?? {})
        .length,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function repairStreamSurface(
  options: RepairStreamSurfaceOptions,
): Promise<StreamSurfaceRepairResult> {
  const surface = await waitForStreamSurface(options)
  const commands = buildStreamSurfaceRepairCommands(surface)
  for (const command of commands) {
    await options.runner.run([command])
  }
  return { windowId: surface.id, commands }
}

async function remainingOwnedSurfaceIds(
  options: WaitForStreamSurfaceAbsenceOptions,
): Promise<readonly number[]> {
  const raw = await options.runner.run(["-t", "get_tree"])
  const presentIds = new Set(
    findStreamSurfaceWindows(JSON.parse(raw), options.selector)
      .filter(surface => !options.ignoredWindowIds?.has(surface.id))
      .map(surface => surface.id),
  )
  return sortedIds(options.ownedWindowIds).filter(id => presentIds.has(id))
}

function sortedIds(ids: ReadonlySet<number>): readonly number[] {
  return [...ids].sort((a, b) => a - b)
}

function selectPrimarySurface(
  surfaces: readonly StreamSurfaceSnapshot[],
): StreamSurfaceSnapshot {
  const focused = surfaces.find(surface => surface.focused)
  return focused ?? [...surfaces].sort((a, b) => a.id - b.id)[0]
}

function walkSwayTreeWithOutput(
  node: SwayNode,
  currentOutput: StreamSurfaceOutputSnapshot | undefined,
  visit: (
    node: SwayNode,
    output: StreamSurfaceOutputSnapshot | undefined,
  ) => void,
) {
  const nextOutput = isOutputNode(node) ? outputSnapshot(node) : currentOutput
  visit(node, nextOutput)
  for (const child of node.nodes ?? [])
    walkSwayTreeWithOutput(child, nextOutput, visit)
  for (const child of node.floating_nodes ?? [])
    walkSwayTreeWithOutput(child, nextOutput, visit)
}

function isOutputNode(node: SwayNode): boolean {
  return (
    node.type === "output" && node.id !== undefined && node.rect !== undefined
  )
}

function outputSnapshot(node: SwayNode): StreamSurfaceOutputSnapshot {
  return {
    id: node.id ?? 0,
    name: node.name ?? null,
    rect: node.rect as SwayRect,
  }
}

function matchesSelector(
  node: SwayNode,
  selector: SwayWindowSelector,
): boolean {
  const appIds = selector.appIds ?? []
  const titles = selector.titles ?? []
  const classes = selector.classes ?? []
  const title = node.window_properties?.title ?? node.name ?? ""
  const className = node.window_properties?.class ?? ""

  if (appIds.length === 0 && titles.length === 0 && classes.length === 0) {
    return node.app_id !== undefined || title.length > 0 || className.length > 0
  }

  return (
    (node.app_id ? appIds.includes(node.app_id) : false) ||
    titles.includes(title) ||
    (className ? classes.includes(className) : false)
  )
}

function defaultSleep(durationMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, durationMs))
}
