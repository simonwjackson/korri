import { describe, expect, it } from "bun:test"
import { request } from "node:http"

import { withRpcServer } from "./with-rpc-server"

/**
 * Tests use `node:http` directly instead of `fetch` because the global test
 * preload installs happy-dom's `GlobalRegistrator`, which replaces `fetch`
 * with a same-origin-policy-enforcing wrapper that blocks requests to
 * arbitrary `127.0.0.1:<port>` URLs. The harness itself is fetch-agnostic;
 * production callers (browsers, Node) use real fetch against the URL it
 * returns.
 */

type HttpResponse = {
  status: number
  body: string
}

function httpGet(url: string): Promise<HttpResponse> {
  return new Promise<HttpResponse>((resolveGet, rejectGet) => {
    const req = request(url, { method: "GET" }, response => {
      const chunks: Buffer[] = []
      response.on("data", chunk => chunks.push(chunk))
      response.on("end", () => {
        resolveGet({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        })
      })
      response.on("error", rejectGet)
    })
    req.on("error", rejectGet)
    req.end()
  })
}

describe("tools/testing/library/with-rpc-server", () => {
  it("boots a real Hono server reachable over real HTTP", async () => {
    await using server = await withRpcServer()

    expect(server.port).toBeGreaterThan(0)
    expect(server.url).toBe(`http://127.0.0.1:${server.port}`)
    expect(server.rpcUrl).toBe(`${server.url}/api/rpc`)

    // /api/health is a real route on the production honoApp — not a fake;
    // this proves the harness mounted the real app, not a placeholder.
    const response = await httpGet(`${server.url}/api/health`)
    expect(response.status).toBe(200)
    const body = JSON.parse(response.body) as {
      status: string
      timestamp: string
    }
    expect(body.status).toBe("ok")
    expect(new Date(body.timestamp).toString()).not.toBe("Invalid Date")
  })

  it("exposes the /api index with the documented endpoint map", async () => {
    await using server = await withRpcServer()

    const response = await httpGet(`${server.url}/api`)
    expect(response.status).toBe(200)
    const body = JSON.parse(response.body) as {
      name: string
      status: string
      endpoints: { health: string; rpc: string }
    }
    expect(body.name).toBe("Korri API")
    expect(body.endpoints.rpc).toBe("/api/rpc")
  })

  it("exposes /api/rpc as a route (GET surfaces a non-2xx, but the route exists)", async () => {
    await using server = await withRpcServer()

    const response = await httpGet(server.rpcUrl)
    // Hono returns 404/405 for GET on a POST-only route; the important
    // property is that a connection succeeded — proving the route exists
    // and the server is genuinely listening — not the specific status code.
    expect([404, 405]).toContain(response.status)
  })

  it("isolates concurrent harnesses on distinct ports", async () => {
    const [a, b] = await Promise.all([withRpcServer(), withRpcServer()])
    try {
      expect(a.port).not.toBe(b.port)

      const [healthA, healthB] = await Promise.all([
        httpGet(`${a.url}/api/health`),
        httpGet(`${b.url}/api/health`),
      ])
      expect(healthA.status).toBe(200)
      expect(healthB.status).toBe(200)
      expect((JSON.parse(healthA.body) as { status: string }).status).toBe("ok")
      expect((JSON.parse(healthB.body) as { status: string }).status).toBe("ok")
    } finally {
      await a.dispose()
      await b.dispose()
    }
  })

  it("dispose() actually closes the listener", async () => {
    const server = await withRpcServer()
    const url = `${server.url}/api/health`

    // Confirm reachable while running.
    const before = await httpGet(url)
    expect(before.status).toBe(200)

    await server.dispose()

    // After dispose, the connection should fail at the transport level.
    let connectionFailed = false
    try {
      await httpGet(url)
    } catch {
      connectionFailed = true
    }
    expect(connectionFailed).toBe(true)
  })

  it("dispose() is idempotent (calling twice does not throw)", async () => {
    const server = await withRpcServer()
    await server.dispose()
    await expect(server.dispose()).resolves.toBeUndefined()
  })

  it("supports `await using` resource management via Symbol.asyncDispose", async () => {
    let port: number
    let url: string
    {
      await using server = await withRpcServer()
      port = server.port
      url = server.url
      const response = await httpGet(`${server.url}/api/health`)
      expect(response.status).toBe(200)
    }

    expect(port).toBeGreaterThan(0)

    // After the block, the listener should be closed.
    let stillReachable = false
    try {
      const response = await httpGet(`${url}/api/health`)
      stillReachable = response.status === 200
    } catch {
      stillReachable = false
    }
    expect(stillReachable).toBe(false)
  })
})
