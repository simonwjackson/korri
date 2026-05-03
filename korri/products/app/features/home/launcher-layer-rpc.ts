import { appRpcGroup } from "@shared/api/rpc/app-rpc-group"
import { RpcClientLive } from "@shared/api/rpc/client"
import { Launcher, LibraryError } from "@shared/library/library-services"
import { Effect, Layer } from "effect"
import { RpcClient } from "effect/unstable/rpc"

export const LauncherLayerRpc = Layer.effect(Launcher)(
  RpcClient.make(appRpcGroup).pipe(
    Effect.map(client => ({
      run: (spec: { readonly command: string }) =>
        client["app.library.launch"]({ id: spec.command }).pipe(
          Effect.mapError(toLibraryError),
        ),
    })),
  ),
).pipe(Layer.provide(RpcClientLive))

function toLibraryError(error: unknown): LibraryError {
  return new LibraryError({
    reason: "unavailable",
    message: error instanceof Error ? error.message : String(error),
  })
}
