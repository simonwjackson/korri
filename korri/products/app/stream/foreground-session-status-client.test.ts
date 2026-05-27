import { describe, expect, it } from "bun:test"
import {
  createForegroundSessionStatusClient,
  pollForegroundSessionStatus,
} from "./foreground-session-status-client"

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

  it("reports HTTP failures without throwing through React callers", async () => {
    const client = createForegroundSessionStatusClient({
      fetch: async () => new Response("nope", { status: 500 }),
    })

    const result = await client.fetchStatusResult()

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.message).toContain("500")
  })

  it("reports malformed snapshots as failures", async () => {
    const client = createForegroundSessionStatusClient({
      fetch: async () =>
        new Response(JSON.stringify({ state: "IdleReady" }), { status: 200 }),
    })

    const result = await client.fetchStatusResult()

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.message).toContain("schema")
  })

  it("polls until aborted", async () => {
    const snapshots: string[] = []
    const abort = new AbortController()
    let sleeps = 0
    const stopped = pollForegroundSessionStatus({
      client: createForegroundSessionStatusClient({
        fetch: async () =>
          new Response(
            JSON.stringify({
              schemaVersion: 1,
              serverTimestamp: "2026-05-26T12:00:00.000Z",
              state: sleeps === 0 ? "Running" : "IdleReady",
              recentEvents: [],
            }),
            { status: 200 },
          ),
      }),
      intervalMs: 1,
      signal: abort.signal,
      sleep: async () => {
        sleeps += 1
        if (sleeps === 2) abort.abort()
      },
      onStatus: status => snapshots.push(status.state),
      onError: error => snapshots.push(`error:${error.message}`),
    })

    await stopped

    expect(snapshots).toEqual(["Running", "IdleReady"])
  })
})
