import { describe, expect, it } from "bun:test"
import {
  rpcUrlForControlUrl,
  stopRemoteGameOnHost,
} from "./overlay-remote-stop"

function logger() {
  const entries: Array<{ level: string; input: unknown; message?: string }> = []
  return {
    entries,
    logger: {
      debug: (input: unknown, message?: string) =>
        entries.push({ level: "debug", input, message }),
      info: (input: unknown, message?: string) =>
        entries.push({ level: "info", input, message }),
      warn: (input: unknown, message?: string) =>
        entries.push({ level: "warn", input, message }),
      error: (input: unknown, message?: string) =>
        entries.push({ level: "error", input, message }),
    },
  }
}

describe("rpcUrlForControlUrl", () => {
  it("appends /api/rpc to a peer control URL", () => {
    expect(rpcUrlForControlUrl("http://aka:3001")).toBe(
      "http://aka:3001/api/rpc",
    )
    expect(rpcUrlForControlUrl("http://aka:3001/api/rpc")).toBe(
      "http://aka:3001/api/rpc",
    )
  })
})

describe("stopRemoteGameOnHost", () => {
  it("calls the peer app.session.stop RPC with confirmation", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = []
    const log = logger()
    await stopRemoteGameOnHost({
      controlUrl: "http://aka:3001",
      logger: log.logger,
      timeoutMs: 1_000,
      fetchImpl: (async (input, init) => {
        calls.push({ input: String(input), init })
        return new Response(
          JSON.stringify({
            _tag: "Exit",
            requestId: "1",
            exit: {
              _tag: "Success",
              value: { _tag: "Stopped", launchId: "remote-1", force: false },
            },
          }),
          { status: 200 },
        )
      }) as typeof fetch,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.input).toBe("http://aka:3001/api/rpc")
    const requestBody = JSON.parse(String(calls[0]?.init?.body))
    expect(requestBody).toMatchObject({
      _tag: "Request",
      tag: "app.session.stop",
      payload: { confirmed: true },
      headers: [],
    })
    expect(requestBody.id).toMatch(/^\d+$/)
    expect(log.entries.at(-1)?.level).toBe("info")
  })

  it("logs and skips when no source control URL is available", async () => {
    const log = logger()
    await stopRemoteGameOnHost({
      controlUrl: undefined,
      logger: log.logger,
      fetchImpl: (async () => {
        throw new Error("should not fetch")
      }) as unknown as typeof fetch,
    })
    expect(log.entries).toEqual([
      {
        level: "warn",
        input: {},
        message:
          "overlay close-game skipped; active stream has no source controlUrl",
      },
    ])
  })
})
