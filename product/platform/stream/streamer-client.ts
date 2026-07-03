import type { LaunchSpec } from "@platform/library/launcher"
import {
  type PluginHandler,
  type ProviderId,
  runPluginHandler,
} from "@platform/plugin"
import type { PluginRegistry } from "@platform/plugin/registry"
import { Effect } from "effect"

/**
 * Platform-side seam for the streamer capability. Runtime callers reach the
 * active streaming backend (Moonlight today) through here, resolving the
 * `stream.launch` handler from the plugin registry rather than importing any
 * streamer module directly. The request payload is streamer-shaped by design
 * (seam shape B); only the dispatch mechanism is generic.
 */
export const STREAM_LAUNCH_OPERATION = "stream.launch" as const

export interface StreamLaunchFacts {
  /** Peer hostname or IP. IPv6 callers must strip URL brackets before rendering. */
  readonly host: string
  /** Resolved input devices discovered by launcher preflight. */
  readonly inputDevices?: readonly string[]
  /** Env values allocated by launcher preflight, e.g. local-control socket facts. */
  readonly environment?: Readonly<Record<string, string>>
}

export interface StreamLaunchRequest {
  readonly facts: StreamLaunchFacts
  /** Streamer-specific policy, opaque to the engine and validated by the plugin. */
  readonly policy?: unknown
}

interface ResolvedStreamer {
  readonly provider: ProviderId
  readonly handler: PluginHandler
}

export function resolveStreamLauncher(
  registry: Pick<PluginRegistry, "enabledPlugins">,
): ResolvedStreamer | undefined {
  for (const plugin of registry.enabledPlugins) {
    const handlers = plugin.contributes.handlers ?? plugin.handlers ?? []
    const handler = handlers.find(
      candidate => candidate.operation === STREAM_LAUNCH_OPERATION,
    )
    if (handler) return { provider: plugin.id, handler }
  }
  return undefined
}

/**
 * Dispatch a stream launch through the registry. Fails closed with a typed
 * error when no enabled plugin provides the streamer capability.
 */
export async function dispatchStreamLaunch(
  registry: Pick<PluginRegistry, "enabledPlugins">,
  request: StreamLaunchRequest,
): Promise<LaunchSpec> {
  const resolved = resolveStreamLauncher(registry)
  if (!resolved) {
    throw new Error(
      "stream.launch: no enabled plugin provides the streamer capability",
    )
  }
  return await Effect.runPromise(
    runPluginHandler<typeof STREAM_LAUNCH_OPERATION, StreamLaunchRequest, LaunchSpec>(
      resolved.handler as PluginHandler<
        typeof STREAM_LAUNCH_OPERATION,
        StreamLaunchRequest,
        LaunchSpec
      >,
      {
        operation: STREAM_LAUNCH_OPERATION,
        provider: resolved.provider,
        input: request,
      },
    ),
  )
}
