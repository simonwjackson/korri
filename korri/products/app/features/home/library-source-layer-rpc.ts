import { appRpcGroup } from "@app/api/app-rpc-group"
import { RpcClientLive } from "@shared/api/rpc/client"
import type { LaunchSpec } from "@shared/library/launcher"
import { LibraryError, LibrarySource } from "@shared/library/library-services"
import { Effect, Layer } from "effect"
import { RpcClient } from "effect/unstable/rpc"

export const LibrarySourceLayerRpc = Layer.effect(LibrarySource)(
  RpcClient.make(appRpcGroup).pipe(
    Effect.map(client => ({
      list: () =>
        client["app.library.list"]({}).pipe(
          Effect.map(response => response.games),
          // Federation v1 (AE1): a 503 "no upstream" from the forwarder
          // is a legitimate empty-state — the renderer should render an
          // empty rail without a load-error overlay. Effect RPC reports
          // such failures through its error channel; collapse them to
          // an empty result so the rail's empty-state path runs.
          Effect.catchCause(cause =>
            isNoUpstreamCause(cause)
              ? Effect.succeed([])
              : Effect.fail(toLibraryError(cause)),
          ),
        ),
      launchSpecFor: (id: string) => Effect.succeed(opaqueLaunchSpecFor(id)),
      resolveLaunchForGame: (id: string) =>
        Effect.succeed({ spec: opaqueLaunchSpecFor(id) }),
    })),
  ),
).pipe(Layer.provide(RpcClientLive))

function toLibraryError(error: unknown): LibraryError {
  return new LibraryError({
    reason: "unavailable",
    message: error instanceof Error ? error.message : String(error),
  })
}

/**
 * Recognize the forwarder's "no upstream" signal. The api-forwarder
 * returns `503 { error: "no upstream" }` when no library-bearing
 * server is reachable (no loopback, no mDNS peer). Effect RPC surfaces
 * this through its Cause channel; the rendered string carries the
 * discriminator either way.
 */
function isNoUpstreamCause(cause: unknown): boolean {
  const rendered = String(cause)
  return rendered.includes("no upstream") || rendered.includes("503")
}

function opaqueLaunchSpecFor(id: string): LaunchSpec {
  return {
    command: id,
    args: [],
  }
}
