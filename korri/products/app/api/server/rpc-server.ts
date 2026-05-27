import {
  makePeerDiscoveryLayer,
  PeerDiscoveryNoop,
} from "@app/peers/peer-discovery"
import { PeerSourceFetcherLive } from "@app/peers/peer-source-fetcher"
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
import { ForegroundSessionHostLive } from "../library/foreground-session-host-layer"
import { handleLaunchLibrary } from "../library/launch.rpc-handler"
import { handleListLibrary } from "../library/list.rpc-handler"
import { handleListSource } from "../source/list.rpc-handler"
import { handleSourceStatus } from "../source/status.rpc-handler"
import { handlePrepareStream } from "../stream/prepare.rpc-handler"
import { handleServerPrepareStream } from "./prepare.rpc-handler"
import { serverRpcGroup } from "./rpc-group"
import { handleServerStatus } from "./status.rpc-handler"

// Federation peer discovery is wired here. In test environments (NODE_ENV=test)
// we use the empty `PeerDiscoveryNoop` to avoid spinning up a real bonjour
// browser at module load — individual test layers compose their own peer set.
// In production, `makePeerDiscoveryLayer` browses the LAN for library-bearing
// peers, filtered by `caps: source` and the local hostId.
const PeerDiscoveryConfigured =
  process.env.NODE_ENV === "test"
    ? PeerDiscoveryNoop
    : makePeerDiscoveryLayer({
        ...(process.env.KORRI_STREAM_ADVERTISE_HOST_ID
          ? { localHostId: process.env.KORRI_STREAM_ADVERTISE_HOST_ID }
          : process.env.KORRI_SERVER_ID
            ? { localHostId: process.env.KORRI_SERVER_ID }
            : {}),
      })

const LibraryInfrastructureLive = Layer.mergeAll(
  LibrarySourceLayerLive,
  LauncherLayerLive,
  GameAssetsLayerLive,
  ForegroundSessionHostLive,
  PeerDiscoveryConfigured,
  PeerSourceFetcherLive,
)

const ServerHandlersLive = serverRpcGroup.toLayer(
  serverRpcGroup.of({
    "app.hello.get": handleGetHello,
    "app.game-assets.candidates.list": handleListGameAssetCandidates,
    "app.game-assets.assign": handleAssignGameAsset,
    "app.game-assets.unassign": handleUnassignGameAsset,
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
