#!/usr/bin/env node

import { honoApp } from "@app/api/hono-app"
import { createAdaptorServer } from "@hono/node-server"
import { logger } from "@shared/logger"

function getConfig() {
  const port = Number.parseInt(process.env.PORT || "3001", 10)
  return {
    port,
    host: process.env.HOST || "0.0.0.0",
  }
}

function createServer() {
  const config = getConfig()
  const server = createAdaptorServer({ fetch: honoApp.fetch })
  return { server, config }
}

async function closeServer(
  server: ReturnType<typeof createAdaptorServer>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

async function main() {
  try {
    const { server, config } = createServer()

    const gracefulShutdown = async (signal: string) => {
      logger.debug(`Received ${signal}, shutting down...`)

      try {
        await closeServer(server)
        logger.debug("Server closed successfully")
        process.exit(0)
      } catch (error) {
        logger.error({ err: error }, "Error during shutdown")
        process.exit(1)
      }
    }

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
    process.on("SIGINT", () => gracefulShutdown("SIGINT"))

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(config.port, config.host, () => {
        logger.info(
          `HTTP server listening on http://${config.host}:${config.port}`,
        )
        resolve()
      })
    })
  } catch (error) {
    logger.error({ err: error }, "Failed to start server")
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(error => {
    logger.error({ err: error }, "Fatal error")
    process.exit(1)
  })
}

export { createServer, main }
