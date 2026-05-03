import { FeatureGatesMiddleware } from "@shared/gates/middleware"
import { RpcGroup } from "effect/unstable/rpc"
import { GetHelloRpc as appHelloGet } from "./hello/rpc"
import { LaunchLibraryRpc as appLibraryLaunch } from "./library/launch.rpc"
import { ListLibraryRpc as appLibraryList } from "./library/list.rpc"

export const appRpcGroup = RpcGroup.make(
  appHelloGet,
  appLibraryList,
  appLibraryLaunch,
).middleware(FeatureGatesMiddleware)

export type AppRpcGroup = typeof appRpcGroup
