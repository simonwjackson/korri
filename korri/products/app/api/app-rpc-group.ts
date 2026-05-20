import { FeatureGatesMiddleware } from "@shared/gates/middleware"
import { RpcGroup } from "effect/unstable/rpc"
import { GetHelloRpc as appHelloGet } from "./hello/rpc"
import { LaunchLibraryRpc as appLibraryLaunch } from "./library/launch.rpc"
import { ListLibraryRpc as appLibraryList } from "./library/list.rpc"
import { ListSourceRpc as appSourceList } from "./source/list.rpc"
import { SourceStatusRpc as appSourceStatus } from "./source/status.rpc"
import { PrepareStreamRpc as appStreamPrepare } from "./stream/prepare.rpc"

export const appRpcGroup = RpcGroup.make(
  appHelloGet,
  appLibraryList,
  appLibraryLaunch,
  appSourceList,
  appSourceStatus,
  appStreamPrepare,
).middleware(FeatureGatesMiddleware)

export type AppRpcGroup = typeof appRpcGroup
