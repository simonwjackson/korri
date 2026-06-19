import { makeLiveAcquisitionLayer } from "@platform/acquisition/acquisition-service"
import { createStaticAcquisitionPluginRegistry } from "@platform/acquisition/plugin-loader"
import { BatchJsonSerializationLive } from "@platform/api/rpc/serialization"
import { KorriControlLayerLiveWithPlugins } from "@platform/control/korri-control-live"
import { FeatureGatesMiddlewareLive } from "@platform/gates/middleware"
import { InstallControlMiddlewareLive } from "../plugin-install/install-control-authorization"
import { GameAssetsLayerLive } from "@platform/library/game-assets/game-assets-service"
import { LauncherLayerLive } from "@platform/library/launcher-layer-live"
import {
  makePeerDiscoveryLayer,
  PeerDiscoveryNoop,
} from "@product/apps/portal/peers/peer-discovery"
import { PeerSourceFetcherLive } from "@product/apps/portal/peers/peer-source-fetcher"
import { makeFilePeerStore } from "@product/apps/portal/peers/peer-store"
import { Effect, Exit, Layer, Scope } from "effect"
import * as HttpEffect from "effect/unstable/http/HttpEffect"
import { RpcServer } from "effect/unstable/rpc"
import { createFirstPartyPluginRegistryFromEnv } from "../../../../plugins"
import { createFirstPartyAcquisitionPluginDefinitionsFromEnv } from "../../../../plugins/acquisition"
import { PluginLibrarySourceLayerLive } from "../../../../plugins/library-source-layer"
import { handleAcquisitionDetails } from "../acquisition/details.rpc-handler"
import { handleAcquisitionPlugins } from "../acquisition/plugins.rpc-handler"
import { handleAcquisitionResolveDownload } from "../acquisition/resolve-download.rpc-handler"
import { handleAcquisitionSearch } from "../acquisition/search.rpc-handler"
import { handleAcquisitionValidateProviders } from "../acquisition/validate-providers.rpc-handler"
import { CatalogSnapshotLive } from "../catalog/catalog-snapshot"
import { handleCatalogSnapshot } from "../catalog/snapshot.rpc-handler"
import { handleAssignGameAsset } from "../game-assets/assign.rpc-handler"
import { handleListGameAssetCandidates } from "../game-assets/list-candidates.rpc-handler"
import { handleUnassignGameAsset } from "../game-assets/unassign.rpc-handler"
import { handleGetHello } from "../hello/rpc-handler"
import { handleDryRunLaunch } from "../library/dry-run.rpc-handler"
import { ForegroundSessionHostLive } from "../library/foreground-session-host-layer"
import { handleLaunchLibrary } from "../library/launch.rpc-handler"
import { RemoteStreamPrepareLive } from "../library/remote-stream-prepare"
import { handleCollectPluginDiagnostics } from "../plugin-diagnostics/collect.rpc-handler"
import { handleRequestPluginInstall } from "../plugin-install/request.rpc-handler"
import { handlePluginInstallStatus } from "../plugin-install/status.rpc-handler"
import { handleCollectPluginLifecycle } from "../plugin-lifecycle/collect.rpc-handler"
import { handleFulfillPluginResource } from "../plugins/fulfill-resource.rpc-handler"
import { handleSessionStatus } from "../session/status.rpc-handler"
import { handleStopSession } from "../session/stop.rpc-handler"
import { handleSourceStatus } from "../source/status.rpc-handler"
import { handlePrepareStream } from "../stream/prepare.rpc-handler"
import { handleGetStreamControlConfig } from "../stream-control/get-config.rpc-handler"
import { handleGetStreamControlControls } from "../stream-control/get-controls.rpc-handler"
import { handleGetStreamControlState } from "../stream-control/get-state.rpc-handler"
import { StreamControlLayerLiveWithPlugins } from "../stream-control/service"
import { handleSetStreamControlAction } from "../stream-control/set-action.rpc-handler"
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
const peerDiscoveryLocalHostId =
  process.env.KORRI_STREAM_ADVERTISE_HOST_ID ?? process.env.KORRI_DAEMON_ID

const PeerDiscoveryConfigured =
  process.env.NODE_ENV === "test"
    ? PeerDiscoveryNoop
    : makePeerDiscoveryLayer({
        ...(peerDiscoveryLocalHostId
          ? { localHostId: peerDiscoveryLocalHostId }
          : {}),
        // Durable peer memory: remembered peers survive restarts and off-LAN
        // reconnects, federating by name without any hand-maintained list.
        peerStore: makeFilePeerStore({
          env: process.env,
          ...(peerDiscoveryLocalHostId
            ? { localHostId: peerDiscoveryLocalHostId }
            : {}),
        }),
      })

const AcquisitionLayerLive = makeLiveAcquisitionLayer({
  registry: createStaticAcquisitionPluginRegistry(
    createFirstPartyAcquisitionPluginDefinitionsFromEnv(process.env),
  ),
})

const KorriControlInfrastructureLive = KorriControlLayerLiveWithPlugins(
  createFirstPartyPluginRegistryFromEnv(process.env),
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(PluginLibrarySourceLayerLive, LauncherLayerLive),
  ),
)

const CatalogDependenciesLive = Layer.mergeAll(
  PluginLibrarySourceLayerLive,
  PeerDiscoveryConfigured,
  PeerSourceFetcherLive,
)

const CatalogInfrastructureLive = CatalogSnapshotLive.pipe(
  Layer.provideMerge(CatalogDependenciesLive),
)

const LibraryInfrastructureLive = Layer.mergeAll(
  KorriControlInfrastructureLive,
  CatalogInfrastructureLive,
  GameAssetsLayerLive,
  ForegroundSessionHostLive,
  RemoteStreamPrepareLive,
  StreamControlLayerLiveWithPlugins(
    createFirstPartyPluginRegistryFromEnv(process.env),
  ),
  AcquisitionLayerLive,
)

const ServerHandlersLive = serverRpcGroup.toLayer(
  serverRpcGroup.of({
    "app.acquisition.search": handleAcquisitionSearch,
    "app.acquisition.details": handleAcquisitionDetails,
    "app.acquisition.providers": handleAcquisitionPlugins,
    "app.acquisition.validate-providers": handleAcquisitionValidateProviders,
    "app.acquisition.resolve-download": handleAcquisitionResolveDownload,
    "app.hello.get": handleGetHello,
    "app.game-assets.candidates.list": handleListGameAssetCandidates,
    "app.game-assets.assign": handleAssignGameAsset,
    "app.game-assets.unassign": handleUnassignGameAsset,
    "app.catalog.snapshot": handleCatalogSnapshot,
    "app.library.launch": handleLaunchLibrary,
    "app.library.launch.dry-run": handleDryRunLaunch,
    "app.plugin.diagnostics.collect": handleCollectPluginDiagnostics,
    "app.plugin.install.request": handleRequestPluginInstall,
    "app.plugin.install.status": handlePluginInstallStatus,
    "app.plugin.lifecycle.collect": handleCollectPluginLifecycle,
    "app.plugins.resource.fulfill": handleFulfillPluginResource,
    "app.source.status": handleSourceStatus,
    "app.server.status": handleServerStatus,
    "app.session.status": handleSessionStatus,
    "app.session.stop": handleStopSession,
    "app.server.stream.prepare": handleServerPrepareStream,
    "app.stream.prepare": handlePrepareStream,
    "app.stream-control.config.get": handleGetStreamControlConfig,
    "app.stream-control.controls.get": handleGetStreamControlControls,
    "app.stream-control.state.get": handleGetStreamControlState,
    "app.stream-control.moonlight-bitrate.set": handleSetMoonlightBitrate,
    "app.stream-control.moonlight-fps.set": handleSetMoonlightFps,
    "app.stream-control.moonlight-resolution.set": handleSetMoonlightResolution,
    "app.stream-control.action.set": handleSetStreamControlAction,
  }),
)

const ServerLive = Layer.mergeAll(
  ServerHandlersLive.pipe(Layer.provide(LibraryInfrastructureLive)),
  FeatureGatesMiddlewareLive,
  InstallControlMiddlewareLive,
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

// fallow-ignore-next-line unused-exports
export const serverRpcDispose = async () => {
  await webHandler.dispose()
  await Effect.runPromise(Scope.close(rpcScope, Exit.void))
}
