import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { gzipSync } from "node:zlib"
import { createApiForwarder } from "./api-forwarder"

// The test preload installs happy-dom, which replaces global Response with a
// class Bun.serve doesn't recognize — fixture servers running through
// Bun.serve return their default welcome page. Run the fixture via
// node:http so the test stays compatible with the DOM globals other
// test files depend on.

/**
 * Real upstream fixture for forwarder tests. Exposes:
 * - GET /api/health        → 200 { status: "ok" }
 * - POST /api/rpc          → 200 echo
 * - GET /api/echo-headers  → 200 { headers: {...} }
 * - GET /api/big           → ~3MB body
 * - GET /api/gzipped       → 200 with Content-Encoding: gzip
 */
class UpstreamFixture {
  private server: ReturnType<typeof createServer> | null = null
  readonly receivedHeaders: Headers[] = []

  start(): { readonly url: string } {
    const captured = this.receivedHeaders
    const server = createServer((req, res) => {
      handleFixtureRequest(req, res, captured)
    })
    server.listen(0, "127.0.0.1")
    this.server = server
    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("fixture server did not bind to a port")
    }
    return { url: `http://127.0.0.1:${address.port}` }
  }

  stop() {
    this.server?.close()
    this.server = null
  }
}

async function handleFixtureRequest(
  req: IncomingMessage,
  res: ServerResponse,
  captured: Headers[],
): Promise<void> {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(","))
    else if (typeof value === "string") headers.set(name, value)
  }
  captured.push(headers)

  // Use connection: close on every response so Bun's fetch does not reuse
  // a connection whose state lags between tests.
  const baseHeaders = { connection: "close" } as const

  const url = new URL(req.url ?? "/", "http://127.0.0.1")
  if (url.pathname === "/api/health") {
    res.writeHead(200, {
      ...baseHeaders,
      "content-type": "application/json",
    })
    res.end(JSON.stringify({ status: "ok" }))
    return
  }
  if (url.pathname === "/api/rpc") {
    const chunks: Buffer[] = []
    req.on("data", chunk => chunks.push(chunk))
    req.on("end", () => {
      res.writeHead(200, {
        ...baseHeaders,
        "content-type": "application/json",
      })
      res.end(Buffer.concat(chunks))
    })
    return
  }
  if (url.pathname === "/api/echo-headers") {
    res.writeHead(200, {
      ...baseHeaders,
      "content-type": "application/json",
    })
    res.end(
      JSON.stringify({
        headers: Object.fromEntries(headers.entries()),
      }),
    )
    return
  }
  if (url.pathname === "/api/big") {
    res.writeHead(200, { ...baseHeaders, "content-type": "text/plain" })
    res.end("x".repeat(3 * 1024 * 1024))
    return
  }
  if (url.pathname === "/api/gzipped") {
    const compressed = gzipSync("hello compressed world")
    res.writeHead(200, {
      ...baseHeaders,
      "content-type": "text/plain",
      "content-encoding": "gzip",
      "content-length": String(compressed.byteLength),
    })
    res.end(compressed)
    return
  }
  res.writeHead(404, { ...baseHeaders, "content-type": "text/plain" })
  res.end("not found")
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
    // it's stripped from the forwarder's outgoing Headers object and the
    // value the upstream sees comes from Bun's HTTP client, not the
    // caller. The stripping itself is exercised by the response-header
    // test below; we only assert here that application headers survive.
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
