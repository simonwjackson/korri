import { FeatureGatesMiddleware } from "@platform/gates/middleware"
import { RpcGroup } from "effect/unstable/rpc"
import { CatalogSnapshotRpc as appCatalogSnapshot } from "./catalog/snapshot.rpc"
import { AssignGameAssetRpc as appGameAssetsAssign } from "./game-assets/assign.rpc"
import { ListGameAssetCandidatesRpc as appGameAssetsCandidatesList } from "./game-assets/list-candidates.rpc"
import { UnassignGameAssetRpc as appGameAssetsUnassign } from "./game-assets/unassign.rpc"
import { GetHelloRpc as appHelloGet } from "./hello/rpc"
import { LaunchLibraryRpc as appLibraryLaunch } from "./library/launch.rpc"
import { CollectPluginDiagnosticsRpc as appPluginDiagnosticsCollect } from "./plugin-diagnostics/collect.rpc"
import { SourceStatusRpc as appSourceStatus } from "./source/status.rpc"
import { PrepareStreamRpc as appStreamPrepare } from "./stream/prepare.rpc"
import { GetStreamControlConfigRpc as appStreamControlConfigGet } from "./stream-control/get-config.rpc"
import { GetStreamControlControlsRpc as appStreamControlControlsGet } from "./stream-control/get-controls.rpc"
import { GetStreamControlStateRpc as appStreamControlStateGet } from "./stream-control/get-state.rpc"
import { SetStreamControlActionRpc as appStreamControlActionSet } from "./stream-control/set-action.rpc"
import { SetBrightnessRpc as appStreamControlBrightnessSet } from "./stream-control/set-brightness.rpc"
import { SetMoonlightBitrateRpc as appStreamControlMoonlightBitrateSet } from "./stream-control/set-moonlight-bitrate.rpc"
import { SetMoonlightFpsRpc as appStreamControlMoonlightFpsSet } from "./stream-control/set-moonlight-fps.rpc"
import { SetMoonlightResolutionRpc as appStreamControlMoonlightResolutionSet } from "./stream-control/set-moonlight-resolution.rpc"

export const appRpcGroup = RpcGroup.make(
  appHelloGet,
  appGameAssetsCandidatesList,
  appGameAssetsAssign,
  appGameAssetsUnassign,
  appCatalogSnapshot,
  appLibraryLaunch,
  appPluginDiagnosticsCollect,
  appSourceStatus,
  appStreamPrepare,
  appStreamControlConfigGet,
  appStreamControlControlsGet,
  appStreamControlStateGet,
  appStreamControlBrightnessSet,
  appStreamControlMoonlightBitrateSet,
  appStreamControlMoonlightFpsSet,
  appStreamControlMoonlightResolutionSet,
  appStreamControlActionSet,
).middleware(FeatureGatesMiddleware)

// fallow-ignore-next-line unused-types
export type AppRpcGroup = typeof appRpcGroup
