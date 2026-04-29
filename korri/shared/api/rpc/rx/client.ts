import { FetchHttpClient } from "@effect/platform"
import * as HttpBody from "@effect/platform/HttpBody"
import * as HttpClient from "@effect/platform/HttpClient"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import {
  RpcClient,
  RpcClientError,
  type RpcMessage,
  RpcSerialization,
} from "@effect/rpc"
import { createMicrotaskBatchQueue } from "@shared/api/rpc/rx/microtask-batch-queue"
import { BatchJsonSerializationLive } from "@shared/api/rpc/serialization"
import { GATES_HEADER, serializeGatesHeader } from "@shared/gates/header"
import { Chunk, Effect, Layer, Runtime, Stream } from "effect"

type EncodedRequest = RpcMessage.FromClientEncoded

type QueuedRequest = {
  readonly request: EncodedRequest
  readonly resolve: () => void
  readonly reject: (error: RpcClientError.RpcClientError) => void
}

const mapProtocolError = (cause: unknown) =>
  new RpcClientError.RpcClientError({
    reason: "Protocol",
    message: "Failed to send HTTP request",
    cause,
  })

const makeBatchedProtocolHttp = (client: HttpClient.HttpClient) =>
  RpcClient.Protocol.make(
    Effect.fnUntraced(function* (writeResponse) {
      const serialization = yield* RpcSerialization.RpcSerialization
      const parser = serialization.unsafeMake()
      const runtime = yield* Effect.runtime<never>()
      const runPromise = Runtime.runPromise(runtime)

      const writeResponses = (
        responses: ReadonlyArray<RpcMessage.FromServerEncoded>,
      ) =>
        Effect.gen(function* () {
          for (const response of responses) {
            yield* writeResponse(response)
          }
        })

      const flushRequests = (requests: readonly QueuedRequest[]) => {
        const effect = Effect.gen(function* () {
          const encoded = parser.encode(requests.map(({ request }) => request))
          if (encoded === undefined) {
            return
          }

          const body =
            typeof encoded === "string"
              ? HttpBody.text(encoded, serialization.contentType)
              : HttpBody.uint8Array(encoded, serialization.contentType)

          if (!serialization.includesFraming) {
            const response = yield* client.post("", { body })
            const text = yield* response.text
            const responses = parser.decode(
              text,
            ) as ReadonlyArray<RpcMessage.FromServerEncoded>
            yield* writeResponses(responses)
            return
          }

          yield* client.post("", { body }).pipe(
            Effect.flatMap(response =>
              Stream.runForEachChunk(response.stream, chunk => {
                const responses = Chunk.toReadonlyArray(chunk).flatMap(bytes =>
                  parser.decode(bytes),
                ) as Array<RpcMessage.FromServerEncoded>
                return responses.length > 0
                  ? writeResponses(responses)
                  : Effect.void
              }),
            ),
          )
        }).pipe(Effect.mapError(mapProtocolError))

        return runPromise(effect)
          .then(() => {
            for (const request of requests) {
              request.resolve()
            }
          })
          .catch(error => {
            const rpcError =
              error instanceof RpcClientError.RpcClientError
                ? error
                : mapProtocolError(error)
            for (const request of requests) {
              request.reject(rpcError)
            }
          })
      }

      const queue = createMicrotaskBatchQueue(flushRequests)

      return {
        send: (request: EncodedRequest) => {
          if (request._tag !== "Request") {
            return Effect.void
          }

          return Effect.promise(
            () =>
              new Promise<void>((resolve, reject) => {
                queue.push({ request, resolve, reject })
              }),
          )
        },
        supportsAck: false,
        supportsTransferables: false,
      }
    }),
  )

function getCurrentGatesHeader(): string {
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

export const RpcClientLive = Layer.scoped(
  RpcClient.Protocol,
  Effect.flatMap(HttpClient.HttpClient, client => {
    const httpClient = HttpClient.mapRequest(client, applyRpcRequestHeaders)
    return makeBatchedProtocolHttp(httpClient)
  }),
).pipe(
  Layer.provide(BatchJsonSerializationLive),
  Layer.provide(FetchHttpClient.layer),
)
