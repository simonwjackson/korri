import { FeatureGatesMiddleware } from "@platform/gates/middleware"
import { RpcGroup } from "effect/unstable/rpc"
import { CatalogSnapshotRpc as appCatalogSnapshot } from "./catalog/snapshot.rpc"
import { DeviceRefreshRpc as appDeviceRefresh } from "./device/refresh.rpc"
import { DeviceStatusRpc as appDeviceStatus } from "./device/status.rpc"
import { AssignGameAssetRpc as appGameAssetsAssign } from "./game-assets/assign.rpc"
import { ListGameAssetCandidatesRpc as appGameAssetsCandidatesList } from "./game-assets/list-candidates.rpc"
import { UnassignGameAssetRpc as appGameAssetsUnassign } from "./game-assets/unassign.rpc"
import { GetHelloRpc as appHelloGet } from "./hello/rpc"
import { LaunchLibraryRpc as appLibraryLaunch } from "./library/launch.rpc"
import { CollectPluginDiagnosticsRpc as appPluginDiagnosticsCollect } from "./plugin-diagnostics/collect.rpc"
import { InstallControlMiddleware } from "./plugin-install/install-control-authorization"
import { RequestPluginInstallRpc as appPluginInstallRequest } from "./plugin-install/request.rpc"
import { PluginInstallStatusRpc as appPluginInstallStatus } from "./plugin-install/status.rpc"
import { CollectPluginLifecycleRpc as appPluginLifecycleCollect } from "./plugin-lifecycle/collect.rpc"
import { SourceStatusRpc as appSourceStatus } from "./source/status.rpc"
import { PrepareStreamRpc as appStreamPrepare } from "./stream/prepare.rpc"
import { GetStreamControlConfigRpc as appStreamControlConfigGet } from "./stream-control/get-config.rpc"
import { GetStreamControlControlsRpc as appStreamControlControlsGet } from "./stream-control/get-controls.rpc"
import { GetStreamControlStateRpc as appStreamControlStateGet } from "./stream-control/get-state.rpc"
import { SetStreamControlActionRpc as appStreamControlActionSet } from "./stream-control/set-action.rpc"
import { SetBrightnessRpc as appStreamControlBrightnessSet } from "./stream-control/set-brightness.rpc"

export const appRpcGroup = RpcGroup.make(
  appHelloGet,
  appGameAssetsCandidatesList,
  appGameAssetsAssign,
  appGameAssetsUnassign,
  appCatalogSnapshot,
  appDeviceStatus,
  appDeviceRefresh,
  appLibraryLaunch,
  appPluginDiagnosticsCollect,
  appPluginInstallRequest,
  appPluginInstallStatus,
  appPluginLifecycleCollect,
  appSourceStatus,
  appStreamPrepare,
  appStreamControlConfigGet,
  appStreamControlControlsGet,
  appStreamControlStateGet,
  appStreamControlBrightnessSet,
  appStreamControlActionSet,
)
  .middleware(FeatureGatesMiddleware)
  .middleware(InstallControlMiddleware)

// fallow-ignore-next-line unused-types
export type AppRpcGroup = typeof appRpcGroup
