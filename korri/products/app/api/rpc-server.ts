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
import { appRpcGroup } from "./app-rpc-group"
import { HandlersLive } from "./handlers"
import { ForegroundSessionHostLive } from "./library/foreground-session-host-layer"

// See server/rpc-server.ts for the federation peer-discovery wiring
// rationale. Tests get the noop layer; production browses the LAN.
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
