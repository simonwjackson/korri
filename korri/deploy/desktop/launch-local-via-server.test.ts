import { describe, expect, test } from "bun:test"
import { createLaunchLocalViaServer } from "./launch-local-via-server"

function makeStubFetch(
  responses: Array<{
    readonly status?: number
    readonly body: unknown
    readonly seen?: (url: string, init: RequestInit) => void
  }>,
): typeof globalThis.fetch {
  let i = 0
  const impl = async (
    input: string | URL | Request,
    init: RequestInit | undefined,
  ): Promise<Response> => {
    const entry = responses[i++]
    if (!entry) throw new Error("stub fetch ran out of responses")
    entry.seen?.(String(input), init ?? {})
    return new Response(JSON.stringify(entry.body), {
      status: entry.status ?? 200,
      headers: { "content-type": "application/json" },
    })
  }
  return impl as unknown as typeof globalThis.fetch
}

const LOCAL_SOURCE = {
  hostId: "sobo",
  controlUrl: "http://192.168.1.239:3001",
  isLocal: true,
} as const

describe("launchLocalViaServer", () => {
  test("returns failed when payload has no source.controlUrl", async () => {
    const launchLocal = createLaunchLocalViaServer()
    const result = await launchLocal({
      id: "celeste-classic",
    } as never)
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.category).toBe("host-unavailable")
      expect(result.message).toContain("controlUrl is missing")
    }
  })

  test("forwards app.library.launch to source.controlUrl and translates launched", async () => {
    let seenUrl = ""
    let seenBody: unknown = null
    const fetch = makeStubFetch([
      {
        body: [
          {
            _tag: "Exit",
            requestId: "1",
            exit: { _tag: "Success", value: { status: "launched" } },
          },
        ],
        seen: (url, init) => {
          seenUrl = url
          seenBody = JSON.parse(String(init.body))
        },
      },
    ])
    const launchLocal = createLaunchLocalViaServer({ fetch, now: () => 1 })
    const result = await launchLocal({
      id: "celeste-classic",
      source: LOCAL_SOURCE,
    } as never)

    expect(seenUrl).toBe("http://192.168.1.239:3001/api/rpc")
    expect(seenBody).toEqual([
      {
        _tag: "Request",
        id: "1",
        tag: "app.library.launch",
        headers: [],
        payload: { id: "celeste-classic", source: LOCAL_SOURCE },
      },
    ])
    expect(result.status).toBe("launched")
    if (result.status === "launched") {
      expect(result.gameId).toBe("celeste-classic")
      expect(result.moonlightCommand).toBe("sessiond")
    }
  })

  test("translates a server-side failed result with failureKind", async () => {
    const fetch = makeStubFetch([
      {
        body: [
          {
            _tag: "Exit",
            requestId: "1",
            exit: {
              _tag: "Success",
              value: {
                status: "failed",
                exitCode: 127,
                stderrTail: "Executable not found",
                failureKind: "no-such-game",
              },
            },
          },
        ],
      },
    ])
    const launchLocal = createLaunchLocalViaServer({ fetch, now: () => 1 })
    const result = await launchLocal({
      id: "missing",
      source: LOCAL_SOURCE,
    } as never)
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.category).toBe("no-such-game")
      expect(result.message).toBe("Executable not found")
    }
  })

  test("translates an unknown server failureKind to host-unavailable", async () => {
    const fetch = makeStubFetch([
      {
        body: [
          {
            _tag: "Exit",
            requestId: "1",
            exit: {
              _tag: "Success",
              value: {
                status: "failed",
                exitCode: 1,
                failureKind: "command-failed",
              },
            },
          },
        ],
      },
    ])
    const launchLocal = createLaunchLocalViaServer({ fetch, now: () => 1 })
    const result = await launchLocal({
      id: "test",
      source: LOCAL_SOURCE,
    } as never)
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.category).toBe("host-unavailable")
    }
  })

  test("translates HTTP error from server into a failed response", async () => {
    const fetch = makeStubFetch([{ status: 500, body: { error: "boom" } }])
    const launchLocal = createLaunchLocalViaServer({ fetch, now: () => 1 })
    const result = await launchLocal({
      id: "test",
      source: LOCAL_SOURCE,
    } as never)
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.category).toBe("host-unavailable")
      expect(result.message).toContain("HTTP 500")
    }
  })

  test("translates a non-Success exit frame into a failed response", async () => {
    const fetch = makeStubFetch([
      {
        body: [
          {
            _tag: "Exit",
            requestId: "1",
            exit: {
              _tag: "Failure",
              cause: [{ _tag: "Fail", error: { message: "unknown game" } }],
            },
          },
        ],
      },
    ])
    const launchLocal = createLaunchLocalViaServer({ fetch, now: () => 1 })
    const result = await launchLocal({
      id: "missing",
      source: LOCAL_SOURCE,
    } as never)
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.category).toBe("host-unavailable")
      expect(result.message).toContain("non-success")
    }
  })

  test("translates fetch rejection into a failed response", async () => {
    const fetch = (async () => {
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof globalThis.fetch
    const launchLocal = createLaunchLocalViaServer({ fetch, now: () => 1 })
    const result = await launchLocal({
      id: "test",
      source: LOCAL_SOURCE,
    } as never)
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.category).toBe("host-unavailable")
      expect(result.message).toContain("ECONNREFUSED")
    }
  })
})
