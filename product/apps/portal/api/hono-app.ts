import { serveGameAssetBytes } from "@platform/api/http/game-asset-bytes"
import { guardRpcEnvelope } from "@platform/api/rpc/envelope-guard"
import {
  type ConfigGraphController,
  createConfigGraphController,
} from "@platform/library/config-graph-controller"
import { resolveAllConfigGraphRoots } from "@platform/library/library-source-layer-live"
import { logger as defaultLogger } from "@platform/logger/logger"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { compress } from "hono/compress"
import { cors } from "hono/cors"
import { handleConfigEvents } from "./config/events"
import { handleDeviceEvents } from "./device/events"
import {
  installControlCookie,
  installControlSecret,
} from "./plugin-install/install-control-authorization"
import { createRemoteInstallControlSession } from "./plugin-install/remote-install-proxy"
import { rpcHandler } from "./rpc-server"
import { serverRpcHandler } from "./server/rpc-server"

const MAX_BODY_SIZE = 10 * 1024 * 1024
const isDev = process.env.NODE_ENV === "development"

export interface CreateHonoAppOptions {
  readonly rpcHandler?: (request: Request) => Promise<Response>
  readonly rpcSurface?: "app" | "server"
  /**
   * Daemon-owned config-graph controller. When omitted, a lazily-created
   * singleton is initialized from `KORRI_CONFIG_ROOTS` on the first
   * `/api/config/events` connection so non-config routes never spin up
   * watchers.
   */
  readonly configGraphController?: ConfigGraphController
}

let lazyConfigGraphController: ConfigGraphController | undefined

function getDefaultConfigGraphController(): ConfigGraphController {
  if (lazyConfigGraphController === undefined) {
    // Mirror korrid's wiring: re-resolve roots on every rebuild and watch
    // the config-roots.d signal dir so dynamically mounted removable media
    // joins the live graph for non-korrid consumers too.
    const controller = createConfigGraphController({
      resolveRoots: () => resolveAllConfigGraphRoots(),
      rootsSignalDir: process.env.KORRI_CONFIG_ROOTS_DIR,
    })
    lazyConfigGraphController = controller
    void controller
      .initialize()
      .catch(error =>
        defaultLogger.warn(
          { err: error },
          "config-graph: lazy controller initialize failed",
        ),
      )
  }
  return lazyConfigGraphController
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

  app.use(
    "/api/*",
    bodyLimit({
      maxSize: MAX_BODY_SIZE,
      onError: c => c.text("Payload Too Large", 413),
    }),
  )

  app.post("/api/install-control/session", async c => {
    const expected = installControlSecret(process.env)
    if (!expected)
      return c.json({ ok: false, reason: "not-configured-or-weak" }, 404)
    let body: {
      readonly pin?: unknown
      readonly secret?: unknown
      readonly source?: unknown
    }
    try {
      body = (await c.req.json()) as {
        readonly pin?: unknown
        readonly secret?: unknown
        readonly source?: unknown
      }
    } catch {
      return c.json({ ok: false, reason: "invalid-json" }, 400)
    }

    const submitted = body.pin ?? body.secret
    const source = remoteInstallSourceFromUnknown(body.source)
    if (source) {
      if (typeof submitted !== "string") {
        return c.json({ ok: false, reason: "unauthorized" }, 401)
      }
      try {
        const remote = await createRemoteInstallControlSession(
          source,
          submitted,
        )
        return new Response(await remote.text(), {
          status: remote.status,
          headers: {
            "content-type":
              remote.headers.get("content-type") ?? "application/json",
          },
        })
      } catch (error) {
        return c.json(
          {
            ok: false,
            reason: "remote-unavailable",
            message: error instanceof Error ? error.message : String(error),
          },
          502,
        )
      }
    }

    if (typeof submitted !== "string" || submitted !== expected) {
      return c.json({ ok: false, reason: "unauthorized" }, 401)
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": await installControlCookie(expected),
      },
    })
  })

  app.on(["GET", "HEAD"], "/api/game-assets/*", c =>
    serveGameAssetBytes(c.req.raw),
  )

  app.on(["POST", "PUT", "PATCH", "DELETE"], "/api/game-assets/*", c =>
    c.text("Method Not Allowed", 405, {
      Allow: "GET, HEAD",
    }),
  )

  const configGraphController = options.configGraphController
  app.get("/api/config/events", c =>
    handleConfigEvents(
      c,
      configGraphController ?? getDefaultConfigGraphController(),
    ),
  )
  app.get("/api/device/events", c => handleDeviceEvents(c))

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
    // Envelope shape guard. Effect-RPC's `Headers.fromInput` (called
    // unvalidated from `RpcServer.js:479`) crashes the whole protocol
    // pipeline when `request.headers` is e.g. `[null]`. Federation v1
    // makes every korrid LAN-reachable so any peer (or curl) can
    // hit this code path. Reject malformed envelopes with a 400 and
    // log the bad envelope for forensics — see
    // product/platform/api/rpc/envelope-guard.ts for the validation
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

interface RemoteInstallSourceShape {
  readonly hostId: string
  readonly controlUrl: string
  readonly isLocal: false
}

function remoteInstallSourceFromUnknown(
  value: unknown,
): RemoteInstallSourceShape | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined
  }
  const record = value as Record<string, unknown>
  return typeof record.hostId === "string" &&
    typeof record.controlUrl === "string" &&
    record.isLocal === false
    ? {
        hostId: record.hostId,
        controlUrl: record.controlUrl,
        isLocal: false,
      }
    : undefined
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
