import { FeatureGatesMiddleware } from "@platform/gates/middleware"
import { RpcGroup } from "effect/unstable/rpc"
import { AcquisitionDetailsRpc as appAcquisitionDetails } from "../acquisition/details.rpc"
import { AcquisitionPluginsRpc as appAcquisitionPlugins } from "../acquisition/plugins.rpc"
import { AcquisitionResolveDownloadRpc as appAcquisitionResolveDownload } from "../acquisition/resolve-download.rpc"
import { AcquisitionSearchRpc as appAcquisitionSearch } from "../acquisition/search.rpc"
import { AcquisitionValidateSourcesRpc as appAcquisitionValidateSources } from "../acquisition/validate-sources.rpc"
import { AssignGameAssetRpc as appGameAssetsAssign } from "../game-assets/assign.rpc"
import { ListGameAssetCandidatesRpc as appGameAssetsCandidatesList } from "../game-assets/list-candidates.rpc"
import { UnassignGameAssetRpc as appGameAssetsUnassign } from "../game-assets/unassign.rpc"
import { GetHelloRpc as appHelloGet } from "../hello/rpc"
import { DryRunLaunchRpc as appLibraryLaunchDryRun } from "../library/dry-run.rpc"
import { LaunchLibraryRpc as appLibraryLaunch } from "../library/launch.rpc"
import { ListLibraryRpc as appLibraryList } from "../library/list.rpc"
import { SessionStatusRpc as appSessionStatus } from "../session/status.rpc"
import { StopSessionRpc as appSessionStop } from "../session/stop.rpc"
import { ListSourceRpc as appSourceList } from "../source/list.rpc"
import { SourceStatusRpc as appSourceStatus } from "../source/status.rpc"
import { PrepareStreamRpc as appStreamPrepare } from "../stream/prepare.rpc"
import { GetStreamControlConfigRpc as appStreamControlConfigGet } from "../stream-control/get-config.rpc"
import { GetStreamControlStateRpc as appStreamControlStateGet } from "../stream-control/get-state.rpc"
import { SetGamescopeFilterRpc as appStreamControlGamescopeFilterSet } from "../stream-control/set-gamescope-filter.rpc"
import { SetGamescopeFpsRpc as appStreamControlGamescopeFpsSet } from "../stream-control/set-gamescope-fps.rpc"
import { SetGamescopeModeRpc as appStreamControlGamescopeModeSet } from "../stream-control/set-gamescope-mode.rpc"
import { SetGamescopeSharpnessRpc as appStreamControlGamescopeSharpnessSet } from "../stream-control/set-gamescope-sharpness.rpc"
import { SetMoonlightBitrateRpc as appStreamControlMoonlightBitrateSet } from "../stream-control/set-moonlight-bitrate.rpc"
import { SetMoonlightFpsRpc as appStreamControlMoonlightFpsSet } from "../stream-control/set-moonlight-fps.rpc"
import { SetMoonlightResolutionRpc as appStreamControlMoonlightResolutionSet } from "../stream-control/set-moonlight-resolution.rpc"
import { ServerPrepareStreamRpc as appServerStreamPrepare } from "./prepare.rpc"
import { ServerStatusRpc as appServerStatus } from "./status.rpc"

export const serverRpcGroup = RpcGroup.make(
  appAcquisitionSearch,
  appAcquisitionDetails,
  appAcquisitionPlugins,
  appAcquisitionValidateSources,
  appAcquisitionResolveDownload,
  appHelloGet,
  appGameAssetsCandidatesList,
  appGameAssetsAssign,
  appGameAssetsUnassign,
  appLibraryList,
  appLibraryLaunch,
  appLibraryLaunchDryRun,
  appSourceList,
  appSourceStatus,
  appServerStatus,
  appSessionStatus,
  appSessionStop,
  appServerStreamPrepare,
  appStreamPrepare,
  appStreamControlConfigGet,
  appStreamControlStateGet,
  appStreamControlMoonlightBitrateSet,
  appStreamControlMoonlightFpsSet,
  appStreamControlMoonlightResolutionSet,
  appStreamControlGamescopeModeSet,
  appStreamControlGamescopeFpsSet,
  appStreamControlGamescopeFilterSet,
  appStreamControlGamescopeSharpnessSet,
).middleware(FeatureGatesMiddleware)

export type ServerRpcGroup = typeof serverRpcGroup
