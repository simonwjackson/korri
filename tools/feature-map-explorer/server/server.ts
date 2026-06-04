/*
 * Feature Map Explorer dev API.
 *
 * Mounts:
 *   GET    /api/health        — liveness check
 *   GET    /api/feature-map   — read the generated feature-map JSON
 *   GET    /api/file?path=…   — read a repo-relative markdown file
 *   PUT    /api/file          — write an allowlisted markdown file
 *   POST   /api/regenerate    — shell out to the generator and return the
 *                                fresh map alongside stdout/stderr
 *
 * The server binds to 127.0.0.1 by default; it must never be exposed
 * beyond localhost.
 */

import { serve } from "@hono/node-server"
import { logger as appLogger } from "@platform/logger"
import { Hono } from "hono"
import { featureMapRoute } from "./routes/feature-map.route"
import { filesRoute } from "./routes/files.route"
import { regenerateRoute } from "./routes/regenerate.route"

const log = appLogger.child({ service: "feature-map-explorer" })

export function createApp(): Hono {
  const app = new Hono()

  app.get("/api/health", c =>
    c.json({
      status: "ok",
      service: "feature-map-explorer",
      timestamp: new Date().toISOString(),
    }),
  )

  app.route("/api", featureMapRoute())
  app.route("/api", filesRoute())
  app.route("/api", regenerateRoute())

  return app
}

const port = Number.parseInt(process.env.PORT ?? "4318", 10)
const hostname = process.env.HOST ?? "127.0.0.1"

const server = serve({ fetch: createApp().fetch, port, hostname }, info => {
  log.info(`api listening on http://${info.address}:${info.port}`)
})

const shutdown = (signal: string) => {
  log.info({ signal }, "shutting down")
  server.close(() => process.exit(0))
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))
