import { BatchJsonSerializationLive } from "@shared/api/rpc/serialization"
import { FeatureGatesMiddlewareLive } from "@shared/gates/middleware"
import { LauncherLayerLive } from "@shared/library/launcher-layer-live"
import { LibrarySourceLayerLive } from "@shared/library/library-source-layer-live"
import { Effect, Exit, Layer, Scope } from "effect"
import * as HttpEffect from "effect/unstable/http/HttpEffect"
import { RpcServer } from "effect/unstable/rpc"
import { handleGetHello } from "../hello/rpc-handler"
import { handleListSource } from "../source/list.rpc-handler"
import { handleSourceStatus } from "../source/status.rpc-handler"
import { handleServerPrepareStream } from "./prepare.rpc-handler"
import { serverRpcGroup } from "./rpc-group"
import { handleServerStatus } from "./status.rpc-handler"

const LibraryInfrastructureLive = Layer.merge(
  LibrarySourceLayerLive,
  LauncherLayerLive,
)

const ServerHandlersLive = serverRpcGroup.toLayer(
  serverRpcGroup.of({
    "app.hello.get": handleGetHello,
    "app.source.list": handleListSource,
    "app.source.status": handleSourceStatus,
    "app.server.status": handleServerStatus,
    "app.server.stream.prepare": handleServerPrepareStream,
  }),
)

const ServerLive = Layer.mergeAll(
  ServerHandlersLive.pipe(Layer.provide(LibraryInfrastructureLive)),
  FeatureGatesMiddlewareLive,
  BatchJsonSerializationLive,
)

const rpcScope = Scope.makeUnsafe()

const webHandler = HttpEffect.toWebHandlerLayerWith(ServerLive, {
  toHandler: context =>
    RpcServer.toHttpEffect(serverRpcGroup).pipe(
      Effect.provideContext(context),
      Effect.provideService(Scope.Scope, rpcScope),
    ),
})

export const serverRpcHandler = (request: Request) =>
  webHandler.handler(request)

export const serverRpcDispose = async () => {
  await webHandler.dispose()
  await Effect.runPromise(Scope.close(rpcScope, Exit.void))
}
