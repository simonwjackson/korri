import { type ChildProcess, spawn as nodeSpawn } from "node:child_process"
import {
  type BridgeActionId,
  type BridgeMapping,
  resolveBridgeMapping,
} from "./mapping"

export type CdpKeyboardEventType = "rawKeyDown" | "keyUp"

export interface CdpKeyboardEvent {
  readonly type: CdpKeyboardEventType
  readonly key: string
  readonly code: string
  readonly windowsVirtualKeyCode: number
}

export interface CdpKeyboardClient {
  readonly dispatch: (event: CdpKeyboardEvent) => Promise<void> | void
}

export type EvdevInputEvent =
  | { readonly kind: "key"; readonly code: string; readonly value: number }
  | { readonly kind: "absolute"; readonly code: string; readonly value: number }

export interface CdpInputTranslator {
  readonly handle: (event: EvdevInputEvent) => Promise<void>
  readonly releaseAll: () => Promise<void>
}

type Direction = "negative" | "positive" | "neutral"

export function createCdpInputTranslator(
  mapping: BridgeMapping,
  client: CdpKeyboardClient,
): CdpInputTranslator {
  const actionSources = new Map<BridgeActionId, Set<string>>()
  const pressedActions = new Set<BridgeActionId>()
  const axisDirections = new Map<string, Direction>()

  const setSource = async (
    action: BridgeActionId,
    source: string,
    active: boolean,
  ) => {
    const sources = actionSources.get(action) ?? new Set<string>()
    if (active) {
      sources.add(source)
      actionSources.set(action, sources)
    } else {
      sources.delete(source)
      if (sources.size === 0) actionSources.delete(action)
    }

    const shouldPress = (actionSources.get(action)?.size ?? 0) > 0
    const isPressed = pressedActions.has(action)
    if (shouldPress === isPressed) return

    const binding = mapping.keys[action]
    if (!binding) throw new Error(`No CDP key binding for action: ${action}`)

    if (shouldPress) {
      pressedActions.add(action)
      await client.dispatch({ type: "rawKeyDown", ...binding })
    } else {
      pressedActions.delete(action)
      await client.dispatch({ type: "keyUp", ...binding })
    }
  }

  const handleKey = async (
    event: Extract<EvdevInputEvent, { kind: "key" }>,
  ) => {
    const action = mapping.buttons[event.code]
    if (!action) return
    await setSource(action, `key:${event.code}`, event.value !== 0)
  }

  const handleAbsolute = async (
    event: Extract<EvdevInputEvent, { kind: "absolute" }>,
  ) => {
    const axis = mapping.axes.find(axis => axis.code === event.code)
    if (!axis) return

    const previous = axisDirections.get(event.code) ?? "neutral"
    let next = previous
    if (event.value <= -axis.pressThreshold) next = "negative"
    else if (event.value >= axis.pressThreshold) next = "positive"
    else if (Math.abs(event.value) < axis.releaseThreshold) next = "neutral"

    if (next === previous) return
    axisDirections.set(event.code, next)

    if (axis.negative && previous === "negative") {
      await setSource(axis.negative, `axis:${event.code}:negative`, false)
    }
    if (axis.positive && previous === "positive") {
      await setSource(axis.positive, `axis:${event.code}:positive`, false)
    }
    if (axis.negative && next === "negative") {
      await setSource(axis.negative, `axis:${event.code}:negative`, true)
    }
    if (axis.positive && next === "positive") {
      await setSource(axis.positive, `axis:${event.code}:positive`, true)
    }
  }

  return {
    handle: async event => {
      if (event.kind === "key") await handleKey(event)
      else await handleAbsolute(event)
    },
    releaseAll: async () => {
      for (const action of [...pressedActions]) {
        const binding = mapping.keys[action]
        if (binding) await client.dispatch({ type: "keyUp", ...binding })
      }
      pressedActions.clear()
      actionSources.clear()
      axisDirections.clear()
    },
  }
}

export interface CdpInputBridgeStartRequest {
  readonly launchId: string
  readonly devicePath: string
  readonly cdpHost: string
  readonly cdpPort: number
  readonly mappingName: string
  readonly target?: {
    readonly type?: string
    readonly urlPattern?: string
    readonly titlePattern?: string
  }
  readonly watchPid?: number
  readonly attachTimeoutMs: number
  readonly failClosed: boolean
}

export interface CdpInputBridgeProcessHandle {
  readonly pid?: number
  readonly exited?: Promise<void>
  readonly stop: () => Promise<void>
}

export interface CdpInputBridgeProcessManager {
  readonly start: (
    request: CdpInputBridgeStartRequest,
  ) => Promise<CdpInputBridgeProcessHandle>
}

type SpawnedChild = Pick<ChildProcess, "pid" | "kill" | "once">
type SpawnFn = (command: string, args: readonly string[]) => SpawnedChild

export function createProcessCdpInputBridge(
  options: { readonly command?: string; readonly spawn?: SpawnFn } = {},
): CdpInputBridgeProcessManager {
  const command = options.command ?? "korri-cdp-input-bridge"
  const spawn = options.spawn ?? ((cmd, args) => nodeSpawn(cmd, [...args]))

  return {
    start: async request => {
      resolveBridgeMapping(request.mappingName)
      const args = bridgeArgs(request)
      const child = spawn(command, args)
      let stopped = false
      const exited = new Promise<void>(resolve => {
        child.once("exit", () => resolve())
      })
      return {
        pid: child.pid ?? undefined,
        exited,
        stop: async () => {
          if (stopped) return
          stopped = true
          child.kill("SIGTERM")
          await Promise.race([
            exited,
            new Promise<void>(resolve => {
              setTimeout(resolve, 2000).unref?.()
            }),
          ])
        },
      }
    },
  }
}

function bridgeArgs(request: CdpInputBridgeStartRequest): readonly string[] {
  const args = [
    "--device",
    request.devicePath,
    "--cdp-host",
    request.cdpHost,
    "--cdp-port",
    String(request.cdpPort),
    "--mapping",
    request.mappingName,
    "--attach-timeout-ms",
    String(request.attachTimeoutMs),
    "--fail-closed",
    request.failClosed ? "true" : "false",
    "--launch-id",
    request.launchId,
  ]

  if (request.watchPid !== undefined) {
    args.push("--watch-pid", String(request.watchPid))
  }
  if (request.target?.type) args.push("--target-type", request.target.type)
  if (request.target?.urlPattern) {
    args.push("--target-url-pattern", request.target.urlPattern)
  }
  if (request.target?.titlePattern) {
    args.push("--target-title-pattern", request.target.titlePattern)
  }

  return args
}
