import { Effect, Exit, Layer, Scope } from "effect"
import * as HttpEffect from "effect/unstable/http/HttpEffect"
import { RpcServer } from "effect/unstable/rpc"
import { FeatureGatesMiddlewareLive } from "@shared/gates/middleware"
import { appRpcGroup } from "./app-rpc-group"
import { HandlersLive } from "./handlers"
import { BatchJsonSerializationLive } from "./serialization"

const ServerLive = Layer.mergeAll(
  HandlersLive,
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
