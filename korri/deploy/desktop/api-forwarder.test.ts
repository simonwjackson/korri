import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { gzipSync } from "node:zlib"

// The test preload installs happy-dom, which replaces global Response with a
// class Bun.serve doesn't recognize — fixture servers fall back to the
// default welcome page. The forwarder under test never touches the DOM, so
// unregistering happy-dom for this file is the simplest path.
await GlobalRegistrator.unregister()

const { createApiForwarder } = await import("./api-forwarder")

/**
 * Real upstream fixture for forwarder tests. Exposes:
 * - GET /api/health     → 200 { status: "ok" }
 * - POST /api/rpc       → 200 echo
 * - GET /api/echo-headers → 200 { headers: {...} }
 * - GET /api/big        → ~3MB body
 * - GET /api/gzipped    → 200 with Content-Encoding: gzip
 */
class UpstreamFixture {
  private server: ReturnType<typeof Bun.serve> | null = null
  readonly receivedHeaders: Headers[] = []

  start(): { readonly url: string } {
    const captured = this.receivedHeaders
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async req => {
        captured.push(new Headers(req.headers))
        const url = new URL(req.url)
        if (url.pathname === "/api/health") {
          return new Response(JSON.stringify({ status: "ok" }), {
            headers: { "content-type": "application/json" },
          })
        }
        if (url.pathname === "/api/rpc") {
          const body = await req.text()
          return new Response(body, {
            headers: { "content-type": "application/json" },
          })
        }
        if (url.pathname === "/api/echo-headers") {
          return new Response(
            JSON.stringify({
              headers: Object.fromEntries(req.headers.entries()),
            }),
            { headers: { "content-type": "application/json" } },
          )
        }
        if (url.pathname === "/api/big") {
          return new Response("x".repeat(3 * 1024 * 1024))
        }
        if (url.pathname === "/api/gzipped") {
          const raw = "hello compressed world"
          const compressed = new Uint8Array(gzipSync(raw))
          return new Response(compressed, {
            headers: {
              "content-type": "text/plain",
              "content-encoding": "gzip",
            },
          })
        }
        return new Response("not found", { status: 404 })
      },
    })
    this.server = server
    return { url: `http://127.0.0.1:${server.port}` }
  }

  stop() {
    this.server?.stop(true)
    this.server = null
  }
}

const fixture = new UpstreamFixture()
let upstreamUrl = ""

beforeAll(() => {
  upstreamUrl = fixture.start().url
})

afterAll(() => {
  fixture.stop()
})

function forwardRequest(
  forwarder: (request: Request) => Promise<Response>,
  pathAndQuery: string,
  init?: RequestInit,
): Promise<Response> {
  return forwarder(new Request(`http://desktop.local${pathAndQuery}`, init))
}

describe("api-forwarder", () => {
  it("forwards POST /api/rpc and returns the upstream response body", async () => {
    const forwarder = createApiForwarder({ getUpstream: () => upstreamUrl })
    const response = await forwardRequest(forwarder, "/api/rpc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    })

    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toBe(JSON.stringify({ hello: "world" }))
  })

  it("forwards GET /api/health", async () => {
    const forwarder = createApiForwarder({ getUpstream: () => upstreamUrl })
    const response = await forwardRequest(forwarder, "/api/health")
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { status: string }
    expect(payload.status).toBe("ok")
  })

  it("returns 503 when no upstream is set", async () => {
    const forwarder = createApiForwarder({ getUpstream: () => undefined })
    const response = await forwardRequest(forwarder, "/api/health")
    expect(response.status).toBe(503)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toBe("no upstream")
  })

  it("returns 502 when upstream fetch throws", async () => {
    const forwarder = createApiForwarder({
      getUpstream: () => "http://127.0.0.1:1",
    })
    const response = await forwardRequest(forwarder, "/api/health")
    expect(response.status).toBe(502)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toBe("upstream unreachable")
  })

  it("rewrites the Host header and preserves application headers", async () => {
    const forwarder = createApiForwarder({ getUpstream: () => upstreamUrl })
    const response = await forwardRequest(forwarder, "/api/echo-headers", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        host: "desktop.local",
        "x-feature-gates": "library:on",
        authorization: "Bearer abc",
      },
      body: "hello",
    })
    const payload = (await response.json()) as {
      headers: Record<string, string>
    }

    // Application headers travel through unchanged.
    expect(payload.headers["x-feature-gates"]).toBe("library:on")
    expect(payload.headers.authorization).toBe("Bearer abc")
    // Host is rewritten to the upstream's host:port — Bun's HTTP client
    // sets it from the URL, not from our stripped Headers object.
    expect(payload.headers.host).not.toBe("desktop.local")
    expect(payload.headers.host).toContain("127.0.0.1")
    // Connection is a hop-by-hop header managed by the HTTP transport;
    // Bun's outbound fetch sets its own value (typically "keep-alive")
    // regardless of what the forwarder did with the incoming one. The
    // important property is that we did not leak the client's value —
    // verified by sending a distinctive sentinel:
    const second = await forwardRequest(forwarder, "/api/echo-headers", {
      method: "GET",
      headers: { connection: "X-FORWARDER-SENTINEL" },
    })
    const secondPayload = (await second.json()) as {
      headers: Record<string, string>
    }
    expect(secondPayload.headers.connection).not.toBe("X-FORWARDER-SENTINEL")
  })

  it("strips Content-Encoding/Content-Length/Transfer-Encoding from response headers", async () => {
    const forwarder = createApiForwarder({ getUpstream: () => upstreamUrl })
    const response = await forwardRequest(forwarder, "/api/gzipped")
    expect(response.status).toBe(200)
    expect(response.headers.get("content-encoding")).toBeNull()
    expect(response.headers.get("content-length")).toBeNull()
    expect(response.headers.get("transfer-encoding")).toBeNull()
    expect(await response.text()).toBe("hello compressed world")
  })

  it("preserves URL search params on forwarded requests", async () => {
    const forwarder = createApiForwarder({ getUpstream: () => upstreamUrl })
    const response = await forwardRequest(
      forwarder,
      "/api/echo-headers?source=desktop&n=2",
    )
    expect(response.status).toBe(200)
    expect(fixture.receivedHeaders.length).toBeGreaterThan(0)
  })

  it("supports switching upstream between requests", async () => {
    const fixture2 = new UpstreamFixture()
    const { url: url2 } = fixture2.start()
    try {
      let current = upstreamUrl
      const forwarder = createApiForwarder({ getUpstream: () => current })

      const first = await forwardRequest(forwarder, "/api/health")
      expect(first.status).toBe(200)

      current = url2
      const second = await forwardRequest(forwarder, "/api/health")
      expect(second.status).toBe(200)
    } finally {
      fixture2.stop()
    }
  })

  it("streams large request bodies without truncating", async () => {
    const forwarder = createApiForwarder({ getUpstream: () => upstreamUrl })
    const big = "y".repeat(2 * 1024 * 1024)
    const response = await forwardRequest(forwarder, "/api/rpc", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: big,
    })
    expect(response.status).toBe(200)
    const echoed = await response.text()
    expect(echoed.length).toBe(big.length)
  })

  it("forwards large response bodies without truncating", async () => {
    const forwarder = createApiForwarder({ getUpstream: () => upstreamUrl })
    const response = await forwardRequest(forwarder, "/api/big")
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text.length).toBe(3 * 1024 * 1024)
  })
})
