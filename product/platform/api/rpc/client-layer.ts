import { Layer } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import { RpcClient } from "effect/unstable/rpc"
import { BatchJsonSerializationLive } from "./serialization"

export interface RpcProtocolHttpLayerOptions {
  readonly headers?: Readonly<Record<string, string>>
}

export function rpcProtocolHttpLayer(
  rpcUrl: string,
  options: RpcProtocolHttpLayerOptions = {},
): Layer.Layer<RpcClient.Protocol> {
  return RpcClient.layerProtocolHttp({
    url: "",
    transformClient: client =>
      HttpClient.mapRequest(client, request => {
        let next = HttpClientRequest.prependUrl(rpcUrl)(request)
        for (const [name, value] of Object.entries(options.headers ?? {})) {
          next = HttpClientRequest.setHeader(name, value)(next)
        }
        return next
      }),
  }).pipe(
    Layer.provide(BatchJsonSerializationLive),
    Layer.provide(FetchHttpClient.layer),
  )
}
