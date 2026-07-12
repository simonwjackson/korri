import {
  type PluginHandler,
  type ProviderId,
  runPluginHandler,
} from "@platform/plugin"
import type { PluginRegistry } from "@platform/plugin/registry"
import { Effect } from "effect"

/**
 * Platform-owned contract for a live stream-control connection. The engine
 * drives the active streamer's local-control session through this interface
 * without importing any streamer module. A streamer plugin supplies the
 * concrete implementation via the `stream-control.connect` operation, so the
 * plugin stays fully removable: with no provider, `connectStreamControlSession`
 * fails closed.
 *
 * Command/query results are intentionally opaque (`unknown`) at this layer —
 * the streamer's wire payloads are its own concern; callers that need typed
 * readback normalize at their seam.
 */
export const STREAM_CONTROL_CONNECT_OPERATION =
  "stream-control.connect" as const

export interface StreamControlTouchBounds {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface StreamControlSessionEvent {
  readonly seq: number
  readonly event: unknown
}

export interface StreamControlSession {
  readonly hello: () => Promise<unknown>
  readonly state: () => Promise<unknown>
  readonly subscribe: () => Promise<unknown>
  readonly setBitrate: (params: {
    readonly bitrateKbps: number
  }) => Promise<unknown>
  readonly setFps: (params: { readonly fps: number }) => Promise<unknown>
  readonly setResolution: (params: {
    readonly width: number
    readonly height: number
  }) => Promise<unknown>
  readonly setTouchBounds: (
    params: StreamControlTouchBounds,
  ) => Promise<unknown>
  readonly onEvent: (
    listener: (delivery: StreamControlSessionEvent) => void,
  ) => () => void
  readonly close: () => void
}

export interface StreamControlConnectInput {
  readonly socketPath: string
}

interface ResolvedConnector {
  readonly provider: ProviderId
  readonly handler: PluginHandler
}

export function resolveStreamControlConnector(
  registry: Pick<PluginRegistry, "enabledPlugins">,
): ResolvedConnector | undefined {
  for (const plugin of registry.enabledPlugins) {
    const handlers = plugin.contributes.handlers ?? plugin.handlers ?? []
    const handler = handlers.find(
      candidate => candidate.operation === STREAM_CONTROL_CONNECT_OPERATION,
    )
    if (handler) return { provider: plugin.id, handler }
  }
  return undefined
}

/**
 * Open a stream-control session through the registry. Fails closed with a typed
 * error when no enabled plugin provides the streamer's control connection.
 */
export async function connectStreamControlSession(
  registry: Pick<PluginRegistry, "enabledPlugins">,
  input: StreamControlConnectInput,
): Promise<StreamControlSession> {
  const resolved = resolveStreamControlConnector(registry)
  if (!resolved) {
    throw new Error(
      "stream-control.connect: no enabled plugin provides a control session",
    )
  }
  return await Effect.runPromise(
    runPluginHandler<
      typeof STREAM_CONTROL_CONNECT_OPERATION,
      StreamControlConnectInput,
      StreamControlSession
    >(
      resolved.handler as PluginHandler<
        typeof STREAM_CONTROL_CONNECT_OPERATION,
        StreamControlConnectInput,
        StreamControlSession
      >,
      {
        operation: STREAM_CONTROL_CONNECT_OPERATION,
        provider: resolved.provider,
        input,
      },
    ),
  )
}
