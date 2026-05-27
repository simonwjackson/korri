import { describe, expect, it } from "bun:test"
import {
  guardRpcEnvelope,
  validateRpcEnvelope,
} from "./envelope-guard"

describe("validateRpcEnvelope (pure)", () => {
  it("accepts an empty batch", () => {
    expect(validateRpcEnvelope([])).toEqual({ ok: true })
  })

  it("accepts a well-formed Request with headers", () => {
    expect(
      validateRpcEnvelope([
        {
          _tag: "Request",
          id: "1",
          tag: "app.library.list",
          payload: {},
          headers: [["x-feature-gates", "abc=1"]],
        },
      ]),
    ).toEqual({ ok: true })
  })

  it("accepts a well-formed Request without headers", () => {
    expect(
      validateRpcEnvelope([
        {
          _tag: "Request",
          id: "1",
          tag: "app.library.list",
          payload: {},
        },
      ]),
    ).toEqual({ ok: true })
  })

  it("accepts non-Request frames (Ack/Interrupt/Ping/Eof) without inspecting their headers", () => {
    expect(
      validateRpcEnvelope([
        { _tag: "Ack", requestId: "1" },
        { _tag: "Interrupt", requestId: "1" },
        { _tag: "Ping" },
        { _tag: "Eof" },
      ]),
    ).toEqual({ ok: true })
  })

  it("accepts a well-formed single-frame Request (Effect-RPC default wire shape)", () => {
    expect(
      validateRpcEnvelope({
        _tag: "Request",
        id: "1",
        tag: "app.library.list",
        payload: {},
        headers: [],
      }),
    ).toEqual({ ok: true })
  })

  it("rejects a single-frame body with malformed headers", () => {
    const result = validateRpcEnvelope({
      _tag: "Request",
      id: "1",
      tag: "x",
      payload: {},
      headers: [null],
    })
    expect(result.ok).toBe(false)
  })

  it("rejects a frame that is a plain primitive", () => {
    const result = validateRpcEnvelope(["not-a-frame"])
    expect(result.ok).toBe(false)
  })

  it("rejects a frame missing _tag", () => {
    const result = validateRpcEnvelope([{ id: "1", payload: {} }])
    expect(result.ok).toBe(false)
  })

  it("rejects Request with headers: [null] — the Effect Headers.fromInput crash class", () => {
    const result = validateRpcEnvelope([
      {
        _tag: "Request",
        id: "1",
        tag: "x",
        payload: {},
        headers: [null],
      },
    ])
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toContain("[0]")
  })

  it("rejects Request with headers as an object rather than array of pairs", () => {
    const result = validateRpcEnvelope([
      {
        _tag: "Request",
        id: "1",
        tag: "x",
        payload: {},
        headers: { "content-type": "application/json" },
      },
    ])
    expect(result.ok).toBe(false)
  })

  it("rejects Request with a header pair whose value is not a string", () => {
    const result = validateRpcEnvelope([
      {
        _tag: "Request",
        id: "1",
        tag: "x",
        payload: {},
        headers: [["k", 42]],
      },
    ])
    expect(result.ok).toBe(false)
  })

  it("rejects Request with missing id", () => {
    const result = validateRpcEnvelope([
      {
        _tag: "Request",
        tag: "x",
        payload: {},
      },
    ])
    expect(result.ok).toBe(false)
  })

  it("includes the frame index in the rejection result so logs can pinpoint the bad frame", () => {
    const result = validateRpcEnvelope([
      { _tag: "Request", id: "1", tag: "x", payload: {} },
      { _tag: "Request", id: "2", tag: "x", payload: {}, headers: [null] },
    ])
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.frameIndex).toBe(1)
  })
})

describe("guardRpcEnvelope (io)", () => {
  function mkRequest(body: string): Request {
    return new Request("https://example.test/api/rpc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
  }

  it("returns the original body text when the envelope is well-formed", async () => {
    const body = JSON.stringify([
      { _tag: "Request", id: "1", tag: "x", payload: {} },
    ])
    const outcome = await guardRpcEnvelope(mkRequest(body))
    expect(outcome.response).toBeUndefined()
    expect(outcome.forwardableBody).toBe(body)
  })

  it("returns a 400 response without consuming downstream when the body is not JSON", async () => {
    const outcome = await guardRpcEnvelope(mkRequest("not-json"))
    expect(outcome.response).toBeDefined()
    expect(outcome.response?.status).toBe(400)
    expect(outcome.forwardableBody).toBeUndefined()
  })

  it("returns a 400 response when an envelope frame has malformed headers", async () => {
    const body = JSON.stringify([
      {
        _tag: "Request",
        id: "1",
        tag: "x",
        payload: {},
        headers: [null],
      },
    ])
    const outcome = await guardRpcEnvelope(mkRequest(body))
    expect(outcome.response?.status).toBe(400)
  })

  it("captures the bad envelope into the injected logger for forensics", async () => {
    const warnings: Array<{
      readonly obj: Record<string, unknown>
      readonly msg: string
    }> = []
    const logger = {
      warn: (obj: Record<string, unknown>, msg: string) => {
        warnings.push({ obj, msg })
      },
    }
    const body = JSON.stringify([
      {
        _tag: "Request",
        id: "1",
        tag: "x",
        payload: {},
        headers: [null],
      },
    ])
    await guardRpcEnvelope(mkRequest(body), { logger })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.obj.reason).toContain("[0]")
    expect(typeof warnings[0]?.obj.bodySample).toBe("string")
  })
})
