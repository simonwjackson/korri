import { createEvierStreamControlApi } from "@app/features/evier/stream-control-api"
import { serveGameAssetBytes } from "@shared/api/http/game-asset-bytes"
import { guardRpcEnvelope } from "@shared/api/rpc/envelope-guard"
import { logger as defaultLogger } from "@shared/logger/logger"
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

  app.on(["GET", "HEAD"], "/api/game-assets/*", c =>
    serveGameAssetBytes(c.req.raw),
  )

  app.on(["POST", "PUT", "PATCH", "DELETE"], "/api/game-assets/*", c =>
    c.text("Method Not Allowed", 405, {
      Allow: "GET, HEAD",
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
  app.route("/api/evier/stream", createEvierStreamControlApi())
  const handleRpc = async (request: Request) => {
    if (rpcSurface === "server" && !isJsonRequest(request)) {
      return new Response("Unsupported Media Type", { status: 415 })
    }
    // Envelope shape guard. Effect-RPC's `Headers.fromInput` (called
    // unvalidated from `RpcServer.js:479`) crashes the whole protocol
    // pipeline when `request.headers` is e.g. `[null]`. Federation v1
    // makes every korri-server LAN-reachable so any peer (or curl) can
    // hit this code path. Reject malformed envelopes with a 400 and
    // log the bad envelope for forensics — see
    // korri/shared/api/rpc/envelope-guard.ts for the validation
    // contract.
    const guard = await guardRpcEnvelope(request, { logger: defaultLogger })
    if (guard.response) return guard.response
    const forwarded = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: guard.forwardableBody,
    })
    return selectedRpcHandler(forwarded)
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
