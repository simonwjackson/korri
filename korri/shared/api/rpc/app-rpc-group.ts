import { GetHelloRpc as appHelloGet } from "@app/api/hello/rpc"
import { RpcGroup } from "@effect/rpc"
import { FeatureGatesMiddleware } from "@shared/gates/middleware"

export const appRpcGroup = RpcGroup.make(appHelloGet).middleware(
  FeatureGatesMiddleware,
)

export type AppRpcGroup = typeof appRpcGroup
