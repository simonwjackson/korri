import { BatchJsonSerializationLive } from "@shared/api/rpc/serialization"
import { FeatureGatesMiddlewareLive } from "@shared/gates/middleware"
import { LauncherLayerLive } from "@shared/library/launcher-layer-live"
import { LibrarySourceLayerLive } from "@shared/library/library-source-layer-live"
import { Effect, Exit, Layer, Scope } from "effect"
import * as HttpEffect from "effect/unstable/http/HttpEffect"
import { RpcServer } from "effect/unstable/rpc"
import { appRpcGroup } from "./app-rpc-group"
import { HandlersLive } from "./handlers"

const LibraryInfrastructureLive = Layer.merge(
  LibrarySourceLayerLive,
  LauncherLayerLive,
)

const ServerLive = Layer.mergeAll(
  HandlersLive.pipe(Layer.provide(LibraryInfrastructureLive)),
  FeatureGatesMiddlewareLive,
  BatchJsonSerializationLive,
)

const rpcScope = Scope.makeUnsafe()

const webHandler = HttpEffect.toWebHandlerLayerWith(ServerLive, {
  toHandler: context =>
    RpcServer.toHttpEffect(appRpcGroup).pipe(
      Effect.provideContext(context),
      Effect.provideService(Scope.Scope, rpcScope),
    ),
})

export const rpcHandler = (request: Request) => webHandler.handler(request)

export const rpcDispose = async () => {
  await webHandler.dispose()
  await Effect.runPromise(Scope.close(rpcScope, Exit.void))
}
