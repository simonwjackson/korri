import { Layer } from "effect"
import { RpcSerialization } from "effect/unstable/rpc"

const decoder = new TextDecoder()

/**
 * JSON serialization variant that understands top-level batches.
 *
 * Effect RPC's default JSON parser returns `[parsed]` even when the payload is
 * already a JSON array. That works for single requests, but batched HTTP POST
 * bodies need the array elements returned individually so the server can route
 * each request.
 */
export const batchJson: RpcSerialization.RpcSerialization["Service"] = {
  contentType: "application/json",
  includesFraming: false,
  makeUnsafe: () => ({
    decode: (data: Uint8Array | string) => {
      const parsed = JSON.parse(
        typeof data === "string" ? data : decoder.decode(data),
      )
      return Array.isArray(parsed) ? parsed : [parsed]
    },
    encode: (response: unknown) => JSON.stringify(response),
  }),
}

export const BatchJsonSerializationLive = Layer.succeed(
  RpcSerialization.RpcSerialization,
)(batchJson)
