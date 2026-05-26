import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import { LocalStreamLaunchResponseSchema } from "./local-stream-launch-rpc"

const decodeResponse = Schema.decodeUnknownSync(LocalStreamLaunchResponseSchema)

describe("local stream launch RPC schema", () => {
  it("accepts session-busy as a typed launch failure category", () => {
    const decoded = decodeResponse({
      status: "failed",
      category: "session-busy",
      message: "Foreground session is not ready (Running)",
    })

    expect(decoded).toEqual({
      status: "failed",
      category: "session-busy",
      message: "Foreground session is not ready (Running)",
    })
  })

  it("rejects unknown launch failure categories", () => {
    expect(() =>
      decodeResponse({
        status: "failed",
        category: "later-maybe",
        message: "unknown category",
      }),
    ).toThrow(/later-maybe/)
  })
})
