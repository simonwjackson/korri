import { GetHelloRpc as appHelloGet } from "@app/api/hello/rpc"
import { LaunchLibraryRpc as appLibraryLaunch } from "@app/api/library/launch.rpc"
import { ListLibraryRpc as appLibraryList } from "@app/api/library/list.rpc"
import { RpcGroup } from "@effect/rpc"
import { FeatureGatesMiddleware } from "@shared/gates/middleware"

export const appRpcGroup = RpcGroup.make(
  appHelloGet,
  appLibraryList,
  appLibraryLaunch,
).middleware(FeatureGatesMiddleware)

export type AppRpcGroup = typeof appRpcGroup
