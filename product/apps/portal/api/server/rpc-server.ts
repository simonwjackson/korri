import { BatchJsonSerializationLive } from "@platform/api/rpc/serialization"
import { FeatureGatesMiddlewareLive } from "@platform/gates/middleware"
import { GameAssetsLayerLive } from "@platform/library/game-assets/game-assets-service"
import { LauncherLayerLive } from "@platform/library/launcher-layer-live"
import { LibrarySourceLayerLive } from "@platform/library/library-source-layer-live"
import {
  makePeerDiscoveryLayer,
  PeerDiscoveryNoop,
} from "@product/apps/portal/peers/peer-discovery"
import { PeerSourceFetcherLive } from "@product/apps/portal/peers/peer-source-fetcher"
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
import { RemoteStreamPrepareLive } from "../library/remote-stream-prepare"
import { handleListSource } from "../source/list.rpc-handler"
import { handleSourceStatus } from "../source/status.rpc-handler"
import { handlePrepareStream } from "../stream/prepare.rpc-handler"
import { handleGetStreamControlConfig } from "../stream-control/get-config.rpc-handler"
import { handleGetStreamControlState } from "../stream-control/get-state.rpc-handler"
import { StreamControlLayerLive } from "../stream-control/service"
import { handleSetGamescopeFilter } from "../stream-control/set-gamescope-filter.rpc-handler"
import { handleSetGamescopeFps } from "../stream-control/set-gamescope-fps.rpc-handler"
import { handleSetGamescopeMode } from "../stream-control/set-gamescope-mode.rpc-handler"
import { handleSetGamescopeSharpness } from "../stream-control/set-gamescope-sharpness.rpc-handler"
import { handleSetMoonlightBitrate } from "../stream-control/set-moonlight-bitrate.rpc-handler"
import { handleSetMoonlightFps } from "../stream-control/set-moonlight-fps.rpc-handler"
import { handleSetMoonlightResolution } from "../stream-control/set-moonlight-resolution.rpc-handler"
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
  RemoteStreamPrepareLive,
  StreamControlLayerLive,
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
    "app.stream-control.config.get": handleGetStreamControlConfig,
    "app.stream-control.state.get": handleGetStreamControlState,
    "app.stream-control.moonlight-bitrate.set": handleSetMoonlightBitrate,
    "app.stream-control.moonlight-fps.set": handleSetMoonlightFps,
    "app.stream-control.moonlight-resolution.set": handleSetMoonlightResolution,
    "app.stream-control.gamescope-mode.set": handleSetGamescopeMode,
    "app.stream-control.gamescope-fps.set": handleSetGamescopeFps,
    "app.stream-control.gamescope-filter.set": handleSetGamescopeFilter,
    "app.stream-control.gamescope-sharpness.set": handleSetGamescopeSharpness,
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
