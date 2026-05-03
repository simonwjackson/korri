import { appRpcGroup } from "@shared/api/rpc/app-rpc-group"
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
          Effect.mapError(toLibraryError),
        ),
      launchSpecFor: (id: string) => Effect.succeed(opaqueLaunchSpecFor(id)),
    })),
  ),
).pipe(Layer.provide(RpcClientLive))

function toLibraryError(error: unknown): LibraryError {
  return new LibraryError({
    reason: "unavailable",
    message: error instanceof Error ? error.message : String(error),
  })
}

function opaqueLaunchSpecFor(id: string): LaunchSpec {
  return {
    command: id,
    args: [],
  }
}
