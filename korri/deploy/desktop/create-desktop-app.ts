import { logger } from "@shared/logger"
import { Hono } from "hono"
import { createApiForwarder } from "./api-forwarder"
import {
  createLaunchBridgeHandler,
  type LaunchBridgeOptions,
} from "./launch-bridge"
import { serveStaticAsset } from "./static-assets"

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
  app.get("*", c => serveStaticAsset(c.req.raw, options))

  return app
}
