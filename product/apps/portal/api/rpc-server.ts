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
import { appRpcGroup } from "./app-rpc-group"
import { CatalogSnapshotLive } from "./catalog/catalog-snapshot"
import { HandlersLive } from "./handlers"
import { ForegroundSessionHostLive } from "./library/foreground-session-host-layer"
import { RemoteStreamPrepareLive } from "./library/remote-stream-prepare"
import { StreamControlLayerLive } from "./stream-control/service"

// See server/rpc-server.ts for the federation peer-discovery wiring
// rationale. Tests get the noop layer; production browses the LAN.
const PeerDiscoveryConfigured =
  process.env.NODE_ENV === "test"
    ? PeerDiscoveryNoop
    : makePeerDiscoveryLayer({
        ...(process.env.KORRI_STREAM_ADVERTISE_HOST_ID
          ? { localHostId: process.env.KORRI_STREAM_ADVERTISE_HOST_ID }
          : process.env.KORRI_DAEMON_ID
            ? { localHostId: process.env.KORRI_DAEMON_ID }
            : {}),
      })

const CatalogDependenciesLive = Layer.mergeAll(
  LibrarySourceLayerLive,
  PeerDiscoveryConfigured,
  PeerSourceFetcherLive,
)

const CatalogInfrastructureLive = CatalogSnapshotLive.pipe(
  Layer.provideMerge(CatalogDependenciesLive),
)

const LibraryInfrastructureLive = Layer.mergeAll(
  CatalogInfrastructureLive,
  LauncherLayerLive,
  GameAssetsLayerLive,
  ForegroundSessionHostLive,
  RemoteStreamPrepareLive,
  StreamControlLayerLive,
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

// fallow-ignore-next-line unused-exports
export const rpcDispose = async () => {
  await webHandler.dispose()
  await Effect.runPromise(Scope.close(rpcScope, Exit.void))
}
