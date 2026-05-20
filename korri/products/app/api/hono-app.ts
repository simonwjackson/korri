import { serveMediaAsset } from "@shared/api/http/media-assets"
import { korriDataPath } from "@shared/config/xdg-paths"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { compress } from "hono/compress"
import { cors } from "hono/cors"
import { rpcHandler } from "./rpc-server"
import { serverRpcHandler } from "./server/rpc-server"

const MAX_BODY_SIZE = 10 * 1024 * 1024
const isDev = process.env.NODE_ENV === "development"

export interface CreateHonoAppOptions {
  readonly rpcHandler?: (request: Request) => Promise<Response>
  readonly rpcSurface?: "app" | "server"
}

export function createHonoApp(options: CreateHonoAppOptions = {}) {
  const app = new Hono()
  const rpcSurface =
    options.rpcSurface ??
    (process.env.KORRI_RPC_SURFACE === "server" ? "server" : "app")
  const selectedRpcHandler =
    options.rpcHandler ??
    (rpcSurface === "server" ? serverRpcHandler : rpcHandler)

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
      mediaRoot:
        process.env.KORRI_MEDIA_ROOT ?? korriDataPath(process.env, "media"),
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
  const handleRpc = async (request: Request) => {
    if (rpcSurface === "server" && !isJsonRequest(request)) {
      return new Response("Unsupported Media Type", { status: 415 })
    }
    return selectedRpcHandler(request)
  }

  app.post("/api/rpc", async c => handleRpc(c.req.raw))
  app.post("/api/rpc/", async c => handleRpc(c.req.raw))

  return app
}

function isJsonRequest(request: Request): boolean {
  return (
    request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json") ?? false
  )
}

export const honoApp = createHonoApp()
