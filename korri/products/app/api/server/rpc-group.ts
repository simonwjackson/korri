import { FeatureGatesMiddleware } from "@shared/gates/middleware"
import { RpcGroup } from "effect/unstable/rpc"
import { GetHelloRpc as appHelloGet } from "../hello/rpc"
import { ListSourceRpc as appSourceList } from "../source/list.rpc"
import { SourceStatusRpc as appSourceStatus } from "../source/status.rpc"
import { PrepareStreamRpc as appStreamPrepare } from "../stream/prepare.rpc"
import { ServerPrepareStreamRpc as appServerStreamPrepare } from "./prepare.rpc"
import { ServerStatusRpc as appServerStatus } from "./status.rpc"

export const serverRpcGroup = RpcGroup.make(
  appHelloGet,
  appSourceList,
  appSourceStatus,
  appServerStatus,
  appServerStreamPrepare,
  appStreamPrepare,
).middleware(FeatureGatesMiddleware)

export type ServerRpcGroup = typeof serverRpcGroup
