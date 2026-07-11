import { describe, expect, it } from "bun:test"
import {
  freezeRemoteGameOnHost,
  thawRemoteGameOnHost,
} from "./overlay-remote-freeze"

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

function exitFrame(value: unknown): Response {
  return new Response(
    JSON.stringify({
      _tag: "Exit",
      requestId: "1",
      exit: { _tag: "Success", value },
    }),
    { status: 200 },
  )
}

describe("freezeRemoteGameOnHost", () => {
  it("posts app.session.freeze to the host and returns applied", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = []
    const log = logger()
    const result = await freezeRemoteGameOnHost({
      controlUrl: "http://aka:3001",
      logger: log.logger,
      timeoutMs: 1_000,
      fetchImpl: (async (input, init) => {
        calls.push({ input: String(input), init })
        return exitFrame({ _tag: "Frozen", launchId: "remote-1" })
      }) as typeof fetch,
    })

    expect(result).toEqual({ _tag: "applied", launchId: "remote-1" })
    expect(calls[0]?.input).toBe("http://aka:3001/api/rpc")
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      _tag: "Request",
      tag: "app.session.freeze",
      payload: {},
      headers: [],
    })
  })

  it("preserves already-frozen as a typed non-error variant", async () => {
    const log = logger()
    const result = await freezeRemoteGameOnHost({
      controlUrl: "http://aka:3001",
      logger: log.logger,
      fetchImpl: (async () =>
        exitFrame({
          _tag: "AlreadyFrozen",
          launchId: "remote-1",
        })) as typeof fetch,
    })
    expect(result).toEqual({ _tag: "already", launchId: "remote-1" })
  })

  it("preserves Unsupported and NothingActive as typed variants", async () => {
    const log = logger()
    const unsupported = await freezeRemoteGameOnHost({
      controlUrl: "http://aka:3001",
      logger: log.logger,
      fetchImpl: (async () =>
        exitFrame({
          _tag: "Unsupported",
          message: "no freeze",
        })) as typeof fetch,
    })
    expect(unsupported).toEqual({ _tag: "unsupported", message: "no freeze" })

    const nothing = await freezeRemoteGameOnHost({
      controlUrl: "http://aka:3001",
      logger: log.logger,
      fetchImpl: (async () =>
        exitFrame({ _tag: "NothingActive" })) as typeof fetch,
    })
    expect(nothing).toEqual({ _tag: "nothing-active" })
  })

  it("skips without fetching when no controlUrl is available", async () => {
    const log = logger()
    const result = await freezeRemoteGameOnHost({
      controlUrl: undefined,
      logger: log.logger,
      fetchImpl: (async () => {
        throw new Error("should not fetch")
      }) as unknown as typeof fetch,
    })
    expect(result).toEqual({ _tag: "skipped-no-control-url" })
    expect(log.entries.at(-1)?.level).toBe("warn")
  })

  it("maps transport failures and host terminals to failed", async () => {
    const log = logger()
    const thrown = await freezeRemoteGameOnHost({
      controlUrl: "http://aka:3001",
      logger: log.logger,
      fetchImpl: (async () => {
        throw new Error("network down")
      }) as unknown as typeof fetch,
    })
    expect(thrown).toMatchObject({ _tag: "failed" })
    expect(log.entries.at(-1)?.level).toBe("warn")

    const hostUnavailable = await freezeRemoteGameOnHost({
      controlUrl: "http://aka:3001",
      logger: log.logger,
      fetchImpl: (async () =>
        exitFrame({
          _tag: "HostUnavailable",
          message: "sessiond offline",
        })) as typeof fetch,
    })
    expect(hostUnavailable).toMatchObject({ _tag: "failed" })
  })
})

describe("thawRemoteGameOnHost", () => {
  it("posts app.session.thaw and preserves already-thawed", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = []
    const log = logger()
    const result = await thawRemoteGameOnHost({
      controlUrl: "http://aka:3001",
      logger: log.logger,
      fetchImpl: (async (input, init) => {
        calls.push({ input: String(input), init })
        return exitFrame({ _tag: "AlreadyThawed", launchId: "remote-1" })
      }) as typeof fetch,
    })

    expect(result).toEqual({ _tag: "already", launchId: "remote-1" })
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      tag: "app.session.thaw",
    })
  })
})
