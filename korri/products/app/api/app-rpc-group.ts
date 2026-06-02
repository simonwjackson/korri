import { FeatureGatesMiddleware } from "@shared/gates/middleware"
import { RpcGroup } from "effect/unstable/rpc"
import { AssignGameAssetRpc as appGameAssetsAssign } from "./game-assets/assign.rpc"
import { ListGameAssetCandidatesRpc as appGameAssetsCandidatesList } from "./game-assets/list-candidates.rpc"
import { UnassignGameAssetRpc as appGameAssetsUnassign } from "./game-assets/unassign.rpc"
import { GetHelloRpc as appHelloGet } from "./hello/rpc"
import { LaunchLibraryRpc as appLibraryLaunch } from "./library/launch.rpc"
import { ListLibraryRpc as appLibraryList } from "./library/list.rpc"
import { ListSourceRpc as appSourceList } from "./source/list.rpc"
import { SourceStatusRpc as appSourceStatus } from "./source/status.rpc"
import { PrepareStreamRpc as appStreamPrepare } from "./stream/prepare.rpc"
import { GetStreamControlConfigRpc as appStreamControlConfigGet } from "./stream-control/get-config.rpc"
import { GetStreamControlStateRpc as appStreamControlStateGet } from "./stream-control/get-state.rpc"
import { SetGamescopeFilterRpc as appStreamControlGamescopeFilterSet } from "./stream-control/set-gamescope-filter.rpc"
import { SetGamescopeFpsRpc as appStreamControlGamescopeFpsSet } from "./stream-control/set-gamescope-fps.rpc"
import { SetGamescopeModeRpc as appStreamControlGamescopeModeSet } from "./stream-control/set-gamescope-mode.rpc"
import { SetGamescopeSharpnessRpc as appStreamControlGamescopeSharpnessSet } from "./stream-control/set-gamescope-sharpness.rpc"
import { SetMoonlightBitrateRpc as appStreamControlMoonlightBitrateSet } from "./stream-control/set-moonlight-bitrate.rpc"
import { SetMoonlightFpsRpc as appStreamControlMoonlightFpsSet } from "./stream-control/set-moonlight-fps.rpc"
import { SetMoonlightResolutionRpc as appStreamControlMoonlightResolutionSet } from "./stream-control/set-moonlight-resolution.rpc"

export const appRpcGroup = RpcGroup.make(
  appHelloGet,
  appGameAssetsCandidatesList,
  appGameAssetsAssign,
  appGameAssetsUnassign,
  appLibraryList,
  appLibraryLaunch,
  appSourceList,
  appSourceStatus,
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

export type AppRpcGroup = typeof appRpcGroup
