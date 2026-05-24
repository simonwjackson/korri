import { BatchJsonSerializationLive } from "@shared/api/rpc/serialization"
import { FeatureGatesMiddlewareLive } from "@shared/gates/middleware"
import { GameAssetsLayerLive } from "@shared/library/game-assets/game-assets-service"
import { LauncherLayerLive } from "@shared/library/launcher-layer-live"
import { LibrarySourceLayerLive } from "@shared/library/library-source-layer-live"
import { Effect, Exit, Layer, Scope } from "effect"
import * as HttpEffect from "effect/unstable/http/HttpEffect"
import { RpcServer } from "effect/unstable/rpc"
import { handleAssignGameAsset } from "../game-assets/assign.rpc-handler"
import { handleListGameAssetCandidates } from "../game-assets/list-candidates.rpc-handler"
import { handleUnassignGameAsset } from "../game-assets/unassign.rpc-handler"
import { handleGetHello } from "../hello/rpc-handler"
import { handleLaunchLibrary } from "../library/launch.rpc-handler"
import { handleListLibrary } from "../library/list.rpc-handler"
import { handleListSource } from "../source/list.rpc-handler"
import { handleSourceStatus } from "../source/status.rpc-handler"
import { handlePrepareStream } from "../stream/prepare.rpc-handler"
import { handleServerPrepareStream } from "./prepare.rpc-handler"
import { serverRpcGroup } from "./rpc-group"
import { handleServerStatus } from "./status.rpc-handler"

const LibraryInfrastructureLive = Layer.mergeAll(
  LibrarySourceLayerLive,
  LauncherLayerLive,
  GameAssetsLayerLive,
)

const ServerHandlersLive = serverRpcGroup.toLayer(
  serverRpcGroup.of({
    "app.hello.get": handleGetHello,
    "app.gameAssets.candidates.list": handleListGameAssetCandidates,
    "app.gameAssets.assign": handleAssignGameAsset,
    "app.gameAssets.unassign": handleUnassignGameAsset,
    "app.library.list": handleListLibrary,
    "app.library.launch": handleLaunchLibrary,
    "app.source.list": handleListSource,
    "app.source.status": handleSourceStatus,
    "app.server.status": handleServerStatus,
    "app.server.stream.prepare": handleServerPrepareStream,
    "app.stream.prepare": handlePrepareStream,
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
