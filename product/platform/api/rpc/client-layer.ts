import { Layer } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import { RpcClient } from "effect/unstable/rpc"
import { BatchJsonSerializationLive } from "./serialization"

export function rpcProtocolHttpLayer(
  rpcUrl: string,
): Layer.Layer<RpcClient.Protocol> {
  return RpcClient.layerProtocolHttp({
    url: "",
    transformClient: client =>
      HttpClient.mapRequest(client, HttpClientRequest.prependUrl(rpcUrl)),
  }).pipe(
    Layer.provide(BatchJsonSerializationLive),
    Layer.provide(FetchHttpClient.layer),
  )
}
