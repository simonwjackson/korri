/*
 * Feature Map Explorer dev API.
 *
 * Placeholder for Unit 1 — only `/api/health` is wired. Units 3+ add
 * /api/feature-map, /api/file (read/write under an allowlist), and
 * /api/regenerate.
 *
 * Binding: defaults to 0.0.0.0 so the dev tool is reachable from any
 * host/IP on the local network. Set HOST=127.0.0.1 to restrict to
 * localhost only. There is no auth; once write routes land, treat any
 * network with access to this port as trusted.
 */

import { serve } from "@hono/node-server"
import { logger as appLogger } from "@shared/logger"
import { Hono } from "hono"

const log = appLogger.child({ service: "feature-map-explorer" })

const app = new Hono()

app.get("/api/health", c =>
  c.json({
    status: "ok",
    service: "feature-map-explorer",
    timestamp: new Date().toISOString(),
  }),
)

const port = Number.parseInt(process.env.PORT ?? "4318", 10)
const hostname = process.env.HOST ?? "0.0.0.0"

const server = serve({ fetch: app.fetch, port, hostname }, info => {
  log.info(`api listening on http://${info.address}:${info.port}`)
})

const shutdown = (signal: string) => {
  log.info({ signal }, "shutting down")
  server.close(() => process.exit(0))
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))
