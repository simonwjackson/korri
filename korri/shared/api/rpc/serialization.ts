import { RpcSerialization } from "@effect/rpc"
import { Layer } from "effect"

const decoder = new TextDecoder()

/**
 * JSON serialization variant that understands top-level batches.
 *
 * Effect RPC's default JSON parser returns `[parsed]` even when the payload is
 * already a JSON array. That works for single requests, but batched HTTP POST
 * bodies need the array elements returned individually so the server can route
 * each request.
 */
export const batchJson = RpcSerialization.RpcSerialization.of({
  contentType: "application/json",
  includesFraming: false,
  unsafeMake: () => ({
    decode: data => {
      const parsed = JSON.parse(
        typeof data === "string" ? data : decoder.decode(data),
      )
      return Array.isArray(parsed) ? parsed : [parsed]
    },
    encode: response => JSON.stringify(response),
  }),
})

export const BatchJsonSerializationLive = Layer.succeed(
  RpcSerialization.RpcSerialization,
  batchJson,
)
