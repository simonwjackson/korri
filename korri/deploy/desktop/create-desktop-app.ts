import { logger } from "@shared/logger"
import { Hono } from "hono"
import { createApiForwarder } from "./api-forwarder"
import type { ConnectionStateSnapshot } from "./connection-state-snapshot"
import {
  createLaunchBridgeHandler,
  type LaunchBridgeOptions,
} from "./launch-bridge"
import type { RuntimeConfig } from "./runtime-config-shape"
import {
  isExtensionBearing,
  serveIndexHtml,
  serveStaticAsset,
} from "./static-assets"
import { renderWaitingPage } from "./waiting-page/render-waiting-page"

export interface CreateDesktopAppOptions {
  readonly assetRoot: string
  /**
   * Returns the currently-connected upstream base URL or undefined when no
   * server is connected. Sourced from the desktop bun's connection
   * controller. Required so this composition stays free of any direct
   * reference to the controller scope.
   */
  readonly getUpstream: () => string | undefined
  /**
   * Returns the current connection-state snapshot (wire-shape: ISO-string
   * timestamps). Read once per request that needs it. Same accessor
   * pattern as `getUpstream` — the composition never imports the
   * controller directly.
   *
   * Two consumers:
   *   - The catch-all GET handler decides between serving the waiting
   *     page (any non-`connected` status) and the React bundle.
   *   - The `/__korri/desktop/connection-status` JSON endpoint returns
   *     the snapshot verbatim for the waiting page's polling loop.
   */
  readonly getConnectionState: () => ConnectionStateSnapshot
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
   * Launch-bridge dependencies. When omitted (e.g. older tests that don't
   * care about the bridge), the route returns 503 unconditionally. main.ts
   * always passes a real value.
   */
  readonly launchBridge?: LaunchBridgeOptions
}

export function createDesktopApp(options: CreateDesktopAppOptions) {
  const app = new Hono()
  const forwarder = createApiForwarder({ getUpstream: options.getUpstream })

  app.post("/__korri/native-input-diagnostic", async c => {
    const body = await c.req.json().catch(() => ({}))
    logger.info(body, "desktop native input diagnostic")
    return c.text("ok")
  })

  // The waiting page polls this endpoint while the connection controller
  // is not yet `connected`. The page reloads (which causes bun to serve
  // the React bundle) once `status === "connected"`. JSON shape matches
  // today's wire format: ISO-string timestamps for `searching` /
  // `reconnecting`; no timestamps when `connected`.
  app.get("/__korri/desktop/connection-status", c =>
    c.json(options.getConnectionState()),
  )

  // Renderer→bun launch bridge: takes a game id, calls prepare-stream
  // against the connected korri-server, then spawns Moonlight locally
  // pointed at that server. See launch-bridge.ts. Registered before the
  // /api/* forwarder catchall so it doesn't get proxied upstream.
  if (options.launchBridge) {
    const handler = createLaunchBridgeHandler(options.launchBridge)
    app.post("/__korri/desktop/launch", c => handler(c.req.raw))
  } else {
    app.post("/__korri/desktop/launch", c =>
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

  // Connection-aware catch-all. While `connected`, serve the React
  // bundle as today (with the runtime-config inliner stacked on top of
  // the `index.html` serve). Otherwise, serve the waiting page for
  // HTML-shaped routes and serve disk-backed assets (or 404) for
  // extension-bearing routes. The branch lives in this single handler
  // so the route registration order stays simple.
  app.get("*", async c => {
    const snapshot = options.getConnectionState()
    const url = new URL(c.req.raw.url)

    if (snapshot.status !== "connected") {
      if (isExtensionBearing(url.pathname)) {
        // Extension-bearing: serve the file if present, else 404. Never
        // the waiting-page HTML body — would corrupt a stale-cached
        // browser tab.
        return serveStaticAsset(c.req.raw, options)
      }
      // HTML-shaped route while disconnected: render the waiting page.
      const body = renderWaitingPage(snapshot, Date.now())
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          // The body varies by connection state and inlined
          // runtime-config. Aggressive caching would serve a stale page.
          "cache-control": "no-store",
        },
      })
    }

    // Connected. Extension-bearing requests serve straight from disk.
    // HTML-shaped requests go through the index.html serve so the
    // runtime-config inliner can rewrite the body before it ships.
    if (isExtensionBearing(url.pathname)) {
      return serveStaticAsset(c.req.raw, options)
    }
    return serveIndexHtml({
      assetRoot: options.assetRoot,
      transformIndexHtml: options.getRuntimeConfig
        ? html => inlineRuntimeConfig(html, options.getRuntimeConfig!())
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
