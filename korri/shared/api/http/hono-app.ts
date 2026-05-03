import { rpcHandler } from "@shared/api/rpc/server"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { compress } from "hono/compress"
import { cors } from "hono/cors"
import { serveMediaAsset } from "./media-assets"

const MAX_BODY_SIZE = 10 * 1024 * 1024
const DEFAULT_MEDIA_ROOT = "/storage/korri/media"
const isDev = process.env.NODE_ENV === "development"

export function createHonoApp() {
  const app = new Hono()

  app.get("/api", c =>
    c.json({
      name: "Korri API",
      status: "ok",
      endpoints: {
        health: "/api/health",
        rpc: "/api/rpc",
      },
    }),
  )

  app.get("/api/health", c =>
    c.json({ status: "ok", timestamp: new Date().toISOString() }),
  )

  app.get("/api/media/*", c =>
    serveMediaAsset(c.req.raw, {
      mediaRoot: process.env.KORRI_MEDIA_ROOT ?? DEFAULT_MEDIA_ROOT,
    }),
  )

  app.use(
    "/api/*",
    bodyLimit({
      maxSize: MAX_BODY_SIZE,
      onError: c => c.text("Payload Too Large", 413),
    }),
  )

  if (isDev) {
    app.use(
      "/api/*",
      cors({
        origin: origin => origin,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Accept", "Origin", "x-feature-gates"],
        credentials: true,
      }),
    )
  }

  app.use("/api/*", compress({ threshold: 1024 }))
  app.options("/api/*", c => c.body(null, 204))
  app.post("/api/rpc", async c => rpcHandler(c.req.raw))
  app.post("/api/rpc/", async c => rpcHandler(c.req.raw))

  return app
}

export const honoApp = createHonoApp()
