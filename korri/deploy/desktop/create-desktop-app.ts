import { honoApp } from "@app/api/hono-app"
import { logger } from "@shared/logger"
import { Hono } from "hono"
import { serveStaticAsset } from "./static-assets"

export interface CreateDesktopAppOptions {
  assetRoot: string
}

export function createDesktopApp(options: CreateDesktopAppOptions) {
  const app = new Hono()

  app.post("/__korri/native-input-diagnostic", async c => {
    const body = await c.req.json().catch(() => ({}))
    logger.info(body, "desktop native input diagnostic")
    return c.text("ok")
  })

  app.all("/api", c => honoApp.fetch(c.req.raw))
  app.all("/api/*", c => honoApp.fetch(c.req.raw))
  app.get("*", c => serveStaticAsset(c.req.raw, options))

  return app
}
