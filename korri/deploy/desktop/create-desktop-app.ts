import { logger } from "@shared/logger"
import type { ForegroundSessionStatusSnapshot } from "@shared/stream/foreground-session-status"
import { Hono } from "hono"
import { createApiForwarder } from "./api-forwarder"
import {
  createLocalStreamLaunchRpcHandler,
  type LaunchBridgeOptions,
} from "./launch-bridge"
import type { RuntimeConfig } from "./runtime-config-shape"
import {
  isExtensionBearing,
  serveIndexHtml,
  serveStaticAsset,
} from "./static-assets"

export interface CreateDesktopAppOptions {
  readonly assetRoot: string
  /**
   * Returns the currently-picked upstream base URL or undefined.
   * Federation v1 picks via `ForwarderUpstream` (loopback fast-path +
   * mDNS fallback). Async so probing/browsing doesn't block module
   * init. When undefined, /api/* requests surface as 503 and the
   * renderer's rail treats that as empty (R3 / AE1).
   */
  readonly getUpstream: () => string | undefined | Promise<string | undefined>
  /**
   * Optional cache invalidation hook — forwarded to api-forwarder so a
   * 502 self-heals by re-picking on the next request.
   */
  readonly invalidateUpstream?: () => void
  /**
   * Returns the runtime-config snapshot inlined into the served
   * `index.html` so the React renderer can read it synchronously at
   * boot via `window.__korriRuntimeConfig`. Read once per `index.html`
   * serve so a future change can become visible without bun restart.
   * Optional: when omitted (e.g. older tests), no script is injected
   * and the renderer falls back to `desktopInput: false`.
   */
  readonly getRuntimeConfig?: () => RuntimeConfig
  /**
   * Returns the current foreground-session lifecycle status snapshot. The
   * desktop composition injects this from the single foreground session owner
   * used by the launch bridge so renderer/operator reads observe the same
   * state that accepts or rejects launches.
   */
  readonly getForegroundSessionStatus?: () => ForegroundSessionStatusSnapshot
  /**
   * Launch-bridge dependencies. When omitted (e.g. older tests that don't
   * care about the bridge), the route returns 503 unconditionally. main.ts
   * always passes a real value.
   */
  readonly launchBridge?: LaunchBridgeOptions
}

export function createDesktopApp(options: CreateDesktopAppOptions) {
  const app = new Hono()
  const forwarder = createApiForwarder({
    getUpstream: options.getUpstream,
    ...(options.invalidateUpstream
      ? { invalidateUpstream: options.invalidateUpstream }
      : {}),
  })

  app.post("/__korri/native-input-diagnostic", async c => {
    const body = await c.req.json().catch(() => ({}))
    logger.info(body, "desktop native input diagnostic")
    return c.text("ok")
  })

  app.get("/__korri/desktop/foreground-session-status", c => {
    const getForegroundSessionStatus = options.getForegroundSessionStatus
    if (!getForegroundSessionStatus) {
      return c.json(
        { error: "Foreground session status not configured" },
        503,
        { "cache-control": "no-store" },
      )
    }
    try {
      return c.json(getForegroundSessionStatus(), 200, {
        "cache-control": "no-store",
      })
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Foreground session status failed",
        },
        500,
        { "cache-control": "no-store" },
      )
    }
  })

  // Diagnostic sink: WebView console.log is not captured into
  // electrobun.log on Linux, so we expose a tiny POST endpoint that
  // the renderer can hit to surface launch-chain trace events into
  // pino. Bridge logs use {msg: "renderer-trace"} so they're easy to
  // grep alongside the bun-side launch-bridge logs.
  app.post("/__korri/desktop/trace", async c => {
    const body = await c.req.json().catch(() => ({}))
    logger.info(body, "renderer-trace")
    return c.body(null, 204)
  })

  // Renderer→bun launch bridge. See launch-bridge.ts. Registered
  // before the /api/* forwarder catchall so it doesn't get proxied.
  if (options.launchBridge) {
    const rpcHandler = createLocalStreamLaunchRpcHandler(options.launchBridge)
    app.post("/__korri/desktop/rpc", c => rpcHandler(c.req.raw))
  } else {
    app.post("/__korri/desktop/rpc", c =>
      c.json(
        {
          status: "failed",
          category: "host-unavailable",
          message: "Launch bridge not configured",
        },
        503,
      ),
    )
  }

  app.all("/api", c => forwarder(c.req.raw))
  app.all("/api/*", c => forwarder(c.req.raw))

  // Catch-all: always serve the React bundle. Federation v1 removed the
  // connection-aware waiting-page branch — the rail handles empty/no-
  // upstream states by rendering nothing (R3 / AE1). Extension-bearing
  // requests serve straight from disk; HTML-shaped requests go through
  // the index.html serve so the runtime-config inliner can rewrite the
  // body before it ships.
  app.get("*", async c => {
    const url = new URL(c.req.raw.url)
    if (isExtensionBearing(url.pathname)) {
      return serveStaticAsset(c.req.raw, options)
    }
    const getRuntimeConfig = options.getRuntimeConfig
    return serveIndexHtml({
      assetRoot: options.assetRoot,
      transformIndexHtml: getRuntimeConfig
        ? html => inlineRuntimeConfig(html, getRuntimeConfig())
        : undefined,
      // index.html body now varies by runtime-config; do not cache.
      indexResponseHeaders: { "cache-control": "no-store" },
    })
  })

  return app
}

/**
 * Inject a synchronous `<script>` setting `window.__korriRuntimeConfig`
 * into the served `index.html` so the renderer can read it at boot
 * without any IPC. Inserted immediately before `</head>` so it runs
 * before any module script in `<body>`.
 *
 * `JSON.stringify` handles boolean/number/string escaping. The result
 * additionally has `</script>` sequences neutralized so a future
 * runtime-config field carrying user-controlled text cannot break out
 * of the inlined tag.
 */
function inlineRuntimeConfig(html: string, runtime: RuntimeConfig): string {
  const json = JSON.stringify(runtime).replace(/<\/script/gi, "<\\/script")
  const tag = `<script>window.__korriRuntimeConfig = ${json};</script>`
  const headCloseIndex = html.search(/<\/head\s*>/i)
  if (headCloseIndex >= 0) {
    return `${html.slice(0, headCloseIndex)}${tag}${html.slice(headCloseIndex)}`
  }
  // Fallback: prepend to <body> if there's no </head>; last-resort
  // prepend to the whole document if there's neither. Keeps the
  // contract that the inlined script always appears before any module
  // script in body order.
  const bodyOpenIndex = html.search(/<body[^>]*>/i)
  if (bodyOpenIndex >= 0) {
    const insertAt = bodyOpenIndex + html.slice(bodyOpenIndex).indexOf(">") + 1
    return `${html.slice(0, insertAt)}${tag}${html.slice(insertAt)}`
  }
  return `${tag}${html}`
}
