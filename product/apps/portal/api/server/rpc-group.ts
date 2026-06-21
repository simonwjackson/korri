import { FeatureGatesMiddleware } from "@platform/gates/middleware"
import { RpcGroup } from "effect/unstable/rpc"
import { AcquisitionDetailsRpc as appAcquisitionDetails } from "../acquisition/details.rpc"
import { AcquisitionPluginsRpc as appAcquisitionPlugins } from "../acquisition/plugins.rpc"
import { AcquisitionResolveDownloadRpc as appAcquisitionResolveDownload } from "../acquisition/resolve-download.rpc"
import { AcquisitionSearchRpc as appAcquisitionSearch } from "../acquisition/search.rpc"
import { AcquisitionValidateProvidersRpc as appAcquisitionValidateProviders } from "../acquisition/validate-providers.rpc"
import { CatalogSnapshotRpc as appCatalogSnapshot } from "../catalog/snapshot.rpc"
import { AssignGameAssetRpc as appGameAssetsAssign } from "../game-assets/assign.rpc"
import { ListGameAssetCandidatesRpc as appGameAssetsCandidatesList } from "../game-assets/list-candidates.rpc"
import { UnassignGameAssetRpc as appGameAssetsUnassign } from "../game-assets/unassign.rpc"
import { GetHelloRpc as appHelloGet } from "../hello/rpc"
import { DryRunLaunchRpc as appLibraryLaunchDryRun } from "../library/dry-run.rpc"
import { LaunchLibraryRpc as appLibraryLaunch } from "../library/launch.rpc"
import { CollectPluginDiagnosticsRpc as appPluginDiagnosticsCollect } from "../plugin-diagnostics/collect.rpc"
import { InstallControlMiddleware } from "../plugin-install/install-control-authorization"
import { RequestPluginInstallRpc as appPluginInstallRequest } from "../plugin-install/request.rpc"
import { PluginInstallStatusRpc as appPluginInstallStatus } from "../plugin-install/status.rpc"
import { CollectPluginLifecycleRpc as appPluginLifecycleCollect } from "../plugin-lifecycle/collect.rpc"
import { FulfillPluginResourceRpc as appPluginResourceFulfill } from "../plugins/fulfill-resource.rpc"
import { SessionStatusRpc as appSessionStatus } from "../session/status.rpc"
import { StopSessionRpc as appSessionStop } from "../session/stop.rpc"
import { SourceStatusRpc as appSourceStatus } from "../source/status.rpc"
import { PrepareStreamRpc as appStreamPrepare } from "../stream/prepare.rpc"
import { GetStreamControlConfigRpc as appStreamControlConfigGet } from "../stream-control/get-config.rpc"
import { GetStreamControlControlsRpc as appStreamControlControlsGet } from "../stream-control/get-controls.rpc"
import { GetStreamControlStateRpc as appStreamControlStateGet } from "../stream-control/get-state.rpc"
import { SetStreamControlActionRpc as appStreamControlActionSet } from "../stream-control/set-action.rpc"
import { SetMoonlightBitrateRpc as appStreamControlMoonlightBitrateSet } from "../stream-control/set-moonlight-bitrate.rpc"
import { SetMoonlightFpsRpc as appStreamControlMoonlightFpsSet } from "../stream-control/set-moonlight-fps.rpc"
import { SetMoonlightResolutionRpc as appStreamControlMoonlightResolutionSet } from "../stream-control/set-moonlight-resolution.rpc"
import { ServerPrepareStreamRpc as appServerStreamPrepare } from "./prepare.rpc"
import { ServerStatusRpc as appServerStatus } from "./status.rpc"

export const serverRpcGroup = RpcGroup.make(
  appAcquisitionSearch,
  appAcquisitionDetails,
  appAcquisitionPlugins,
  appAcquisitionValidateProviders,
  appAcquisitionResolveDownload,
  appHelloGet,
  appGameAssetsCandidatesList,
  appGameAssetsAssign,
  appGameAssetsUnassign,
  appCatalogSnapshot,
  appLibraryLaunch,
  appLibraryLaunchDryRun,
  appPluginDiagnosticsCollect,
  appPluginInstallRequest,
  appPluginInstallStatus,
  appPluginLifecycleCollect,
  appPluginResourceFulfill,
  appSourceStatus,
  appServerStatus,
  appSessionStatus,
  appSessionStop,
  appServerStreamPrepare,
  appStreamPrepare,
  appStreamControlConfigGet,
  appStreamControlControlsGet,
  appStreamControlStateGet,
  appStreamControlMoonlightBitrateSet,
  appStreamControlMoonlightFpsSet,
  appStreamControlMoonlightResolutionSet,
  appStreamControlActionSet,
)
  .middleware(FeatureGatesMiddleware)
  .middleware(InstallControlMiddleware)

// fallow-ignore-next-line unused-types
export type ServerRpcGroup = typeof serverRpcGroup
