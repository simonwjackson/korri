import { logger } from "@shared/logger"
import { Hono } from "hono"
import { createApiForwarder } from "./api-forwarder"
import type { ConnectionStateSnapshot } from "./connection-state-snapshot"
import {
  createLaunchBridgeHandler,
  type LaunchBridgeOptions,
} from "./launch-bridge"
import { isExtensionBearing, serveStaticAsset } from "./static-assets"
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
  // bundle as today. Otherwise, serve the waiting page for HTML-shaped
  // routes and serve disk-backed assets (or 404) for extension-bearing
  // routes. The branch lives in this single handler so the route
  // registration order stays simple.
  app.get("*", async c => {
    const snapshot = options.getConnectionState()
    if (snapshot.status !== "connected") {
      const url = new URL(c.req.raw.url)
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
          // The body varies by connection state and (later) inlined
          // runtime-config. Aggressive caching would serve a stale page.
          "cache-control": "no-store",
        },
      })
    }
    return serveStaticAsset(c.req.raw, options)
  })

  return app
}
