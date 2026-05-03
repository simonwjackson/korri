import { BatchJsonSerializationLive } from "@shared/api/rpc/serialization"
import { GATES_HEADER, serializeGatesHeader } from "@shared/gates/header"
import { Layer } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import { RpcClient } from "effect/unstable/rpc"

function getCurrentGatesHeader(): string {
  // Reads only non-sensitive feature-gate ids to forward the current local
  // development/user preference state across the RPC boundary.
  if (typeof localStorage === "undefined") {
    return ""
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith("gates:")) {
        const raw = localStorage.getItem(key)
        if (raw) {
          const ids = JSON.parse(raw) as string[]
          if (ids.length > 0) {
            return serializeGatesHeader(new Set(ids))
          }
        }
      }
    }
  } catch {
    return ""
  }

  return ""
}

function applyRpcRequestHeaders(request: HttpClientRequest.HttpClientRequest) {
  let next = HttpClientRequest.prependUrl("/api/rpc")(request)

  const gatesValue = getCurrentGatesHeader()
  if (gatesValue) {
    next = HttpClientRequest.setHeader(GATES_HEADER, gatesValue)(next)
  }

  return next
}

export const RpcClientLive = RpcClient.layerProtocolHttp({
  url: "",
  transformClient: client =>
    HttpClient.mapRequest(client, applyRpcRequestHeaders),
}).pipe(
  Layer.provide(BatchJsonSerializationLive),
  Layer.provide(FetchHttpClient.layer),
)
