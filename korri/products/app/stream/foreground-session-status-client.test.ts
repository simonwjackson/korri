import { describe, expect, it } from "bun:test"
import { createForegroundSessionStatusClient } from "./foreground-session-status-client"

describe("foreground session status client", () => {
  it("fetches and decodes a valid status snapshot", async () => {
    const client = createForegroundSessionStatusClient({
      statusUrl:
        "http://desktop.local/__korri/desktop/foreground-session-status",
      fetch: async url => {
        expect(url).toBe(
          "http://desktop.local/__korri/desktop/foreground-session-status",
        )
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            serverTimestamp: "2026-05-26T12:00:00.000Z",
            state: "IdleReady",
            recentEvents: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      },
    })

    await expect(client.fetchStatus()).resolves.toEqual({
      schemaVersion: 1,
      serverTimestamp: "2026-05-26T12:00:00.000Z",
      state: "IdleReady",
      recentEvents: [],
    })
  })

  it("reports network failures without throwing through React callers", async () => {
    const client = createForegroundSessionStatusClient({
      fetch: async () => {
        throw new Error("connection refused")
      },
    })

    const result = await client.fetchStatusResult()

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.kind).toBe("network")
      expect(result.message).toContain("connection refused")
    }
  })

  it("reports HTTP failures without throwing through React callers", async () => {
    const client = createForegroundSessionStatusClient({
      fetch: async () => new Response("nope", { status: 500 }),
    })

    const result = await client.fetchStatusResult()

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.kind).toBe("http")
      expect(result.message).toContain("500")
    }
  })

  it("reports malformed snapshots as failures", async () => {
    const client = createForegroundSessionStatusClient({
      fetch: async () =>
        new Response(JSON.stringify({ state: "IdleReady" }), { status: 200 }),
    })

    const result = await client.fetchStatusResult()

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.kind).toBe("schema")
      expect(result.message).toContain("schemaVersion")
    }
  })

  it("passes abort signals into the status fetch", async () => {
    const abort = new AbortController()
    let receivedSignal: AbortSignal | undefined
    const client = createForegroundSessionStatusClient({
      fetch: async (_url, init) => {
        receivedSignal = init?.signal ?? undefined
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            serverTimestamp: "2026-05-26T12:00:00.000Z",
            state: "IdleReady",
            recentEvents: [],
          }),
          { status: 200 },
        )
      },
    })

    await client.fetchStatusResult({ signal: abort.signal })

    expect(receivedSignal).toBe(abort.signal)
  })
})
