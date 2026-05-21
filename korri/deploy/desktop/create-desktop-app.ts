import { logger } from "@shared/logger"
import { Hono } from "hono"
import { createApiForwarder } from "./api-forwarder"
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
}

export function createDesktopApp(options: CreateDesktopAppOptions) {
  const app = new Hono()
  const forwarder = createApiForwarder({ getUpstream: options.getUpstream })

  app.post("/__korri/native-input-diagnostic", async c => {
    const body = await c.req.json().catch(() => ({}))
    logger.info(body, "desktop native input diagnostic")
    return c.text("ok")
  })

  app.all("/api", c => forwarder(c.req.raw))
  app.all("/api/*", c => forwarder(c.req.raw))
  app.get("*", c => serveStaticAsset(c.req.raw, options))

  return app
}
