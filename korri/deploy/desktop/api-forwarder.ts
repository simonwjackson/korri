import { logger } from "@shared/logger"
import { fetch as bunFetch } from "bun"

export interface ApiForwarderOptions {
  /**
   * Returns the currently-connected upstream base URL (e.g.
   * `http://192.168.1.50:3010`) or `undefined` when no server is
   * connected. The forwarder reads this on every request so the desktop
   * bun's connection controller can swap the upstream transparently.
   */
  readonly getUpstream: () => string | undefined
}

const STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
])
const STRIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
])

/**
 * Build a Hono-compatible request handler that forwards `/api/*` to the
 * currently-connected `korri-server`. The handler has zero RPC handlers
 * and zero business logic — it only rewrites URLs and strips hop-by-hop
 * headers.
 */
export function createApiForwarder(
  options: ApiForwarderOptions,
): (request: Request) => Promise<Response> {
  return async request => {
    const upstream = options.getUpstream()
    if (!upstream) {
      return jsonResponse(503, { error: "no upstream" })
    }

    const upstreamUrl = buildUpstreamUrl(upstream, request.url)
    const headers = stripRequestHeaders(request.headers)
    const init: RequestInit = {
      method: request.method,
      headers,
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body
      // Bun's fetch requires `duplex: "half"` for streaming bodies.
      ;(init as { duplex?: string }).duplex = "half"
    }

    let upstreamResponse: Response
    try {
      upstreamResponse = await bunFetch(upstreamUrl, init)
    } catch (error) {
      logger.warn(
        { err: error, upstream, url: request.url },
        "api-forwarder: upstream fetch failed",
      )
      return jsonResponse(502, { error: "upstream unreachable" })
    }

    // Buffer the upstream body. The forwarder is request/response only —
    // there are no streaming endpoints today — and buffering keeps the
    // outgoing Response constructable from the test environment's Response
    // global as well as from Bun's.
    const bodyBytes = new Uint8Array(await upstreamResponse.arrayBuffer())
    return new Response(bodyBytes, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: stripResponseHeaders(upstreamResponse.headers),
    })
  }
}

function buildUpstreamUrl(upstream: string, requestUrl: string): string {
  const incoming = new URL(requestUrl)
  const base = new URL(upstream)
  // Preserve the original /api/* path verbatim, including query string.
  base.pathname = trimTrailingSlash(base.pathname) + incoming.pathname
  base.search = incoming.search
  return base.toString()
}

function trimTrailingSlash(pathname: string): string {
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
}

function stripRequestHeaders(headers: Headers): Headers {
  const out = new Headers()
  for (const [name, value] of headers.entries()) {
    if (STRIPPED_REQUEST_HEADERS.has(name.toLowerCase())) continue
    out.append(name, value)
  }
  return out
}

function stripResponseHeaders(headers: Headers): Headers {
  const out = new Headers()
  for (const [name, value] of headers.entries()) {
    if (STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) continue
    out.append(name, value)
  }
  return out
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}
