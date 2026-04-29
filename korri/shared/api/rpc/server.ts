import { HttpServer } from "@effect/platform"
import { RpcServer } from "@effect/rpc"
import { FeatureGatesMiddlewareLive } from "@shared/gates/middleware"
import { Layer } from "effect"
import { appRpcGroup } from "./app-rpc-group"
import { HandlersLive } from "./handlers"
import { BatchJsonSerializationLive } from "./serialization"

const ServerLive = Layer.mergeAll(
  HandlersLive,
  FeatureGatesMiddlewareLive,
  BatchJsonSerializationLive,
  HttpServer.layerContext,
)

export const { handler: rpcHandler, dispose: rpcDispose } =
  RpcServer.toWebHandler(appRpcGroup, {
    layer: ServerLive,
  })
