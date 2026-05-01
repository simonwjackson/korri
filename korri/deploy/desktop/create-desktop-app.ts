import { honoApp } from "@shared/api/http/hono-app"
import { Hono } from "hono"
import { serveStaticAsset } from "./static-assets"

export interface CreateDesktopAppOptions {
  assetRoot: string
}

export function createDesktopApp(options: CreateDesktopAppOptions) {
  const app = new Hono()

  app.all("/api", c => honoApp.fetch(c.req.raw))
  app.all("/api/*", c => honoApp.fetch(c.req.raw))
  app.get("*", c => serveStaticAsset(c.req.raw, options))

  return app
}
