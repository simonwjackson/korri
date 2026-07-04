import { describe, expect, it } from "bun:test"
import { rpcResult } from "./state-normalizer"

// Streamer-specific readback normalization moved to the owning plugin
// (product/plugins/moonlight/src/stream-control/handlers.test.ts). The platform
// keeps only the generic JSON-RPC result reader.
describe("stream-control state normalizer", () => {
  it("extracts the result record from a JSON-RPC response", () => {
    expect(
      rpcResult({ jsonrpc: "2.0", id: "state", result: { fps: 60 } }),
    ).toEqual({ fps: 60 })
  })

  it("returns undefined for malformed or non-record responses", () => {
    expect(rpcResult(undefined)).toBeUndefined()
    expect(rpcResult("nope")).toBeUndefined()
    expect(rpcResult({ result: 42 })).toBeUndefined()
    expect(rpcResult([{ result: {} }])).toBeUndefined()
  })
})
