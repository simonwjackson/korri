import { FeatureGatesMiddleware } from "@shared/gates/middleware"
import { RpcGroup } from "effect/unstable/rpc"
import { AssignGameAssetRpc as appGameAssetsAssign } from "../game-assets/assign.rpc"
import { ListGameAssetCandidatesRpc as appGameAssetsCandidatesList } from "../game-assets/list-candidates.rpc"
import { UnassignGameAssetRpc as appGameAssetsUnassign } from "../game-assets/unassign.rpc"
import { GetHelloRpc as appHelloGet } from "../hello/rpc"
import { LaunchLibraryRpc as appLibraryLaunch } from "../library/launch.rpc"
import { ListLibraryRpc as appLibraryList } from "../library/list.rpc"
import { ListSourceRpc as appSourceList } from "../source/list.rpc"
import { SourceStatusRpc as appSourceStatus } from "../source/status.rpc"
import { PrepareStreamRpc as appStreamPrepare } from "../stream/prepare.rpc"
import { ServerPrepareStreamRpc as appServerStreamPrepare } from "./prepare.rpc"
import { ServerStatusRpc as appServerStatus } from "./status.rpc"

export const serverRpcGroup = RpcGroup.make(
  appHelloGet,
  appGameAssetsCandidatesList,
  appGameAssetsAssign,
  appGameAssetsUnassign,
  appLibraryList,
  appLibraryLaunch,
  appSourceList,
  appSourceStatus,
  appServerStatus,
  appServerStreamPrepare,
  appStreamPrepare,
).middleware(FeatureGatesMiddleware)

export type ServerRpcGroup = typeof serverRpcGroup
