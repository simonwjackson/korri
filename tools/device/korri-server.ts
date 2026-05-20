#!/usr/bin/env node

import { createHonoApp } from "@app/api/hono-app"
import { serverRpcHandler } from "@app/api/server/rpc-server"
import { createAdaptorServer } from "@hono/node-server"
import { logger } from "@shared/logger"
import {
  advertiseStreamHost,
  type StreamAdvertisement,
} from "./lan-stream-advertise"

export interface KorriServerConfig {
  readonly host: string
  readonly port: number
  readonly advertise: boolean
  readonly advertiseName?: string
  readonly advertiseHostId?: string
  readonly advertiseCapabilities: readonly string[]
}

export interface KorriServerHandle {
  readonly start: () => Promise<void>
  readonly stop: () => Promise<void>
}

export interface CreateKorriServerOptions {
  readonly config?: KorriServerConfig
  readonly advertise?: (options: {
    readonly name?: string
    readonly hostId?: string
    readonly port: number
    readonly capabilities: readonly string[]
  }) => StreamAdvertisement
}

export function getKorriServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): KorriServerConfig {
  const port = Number.parseInt(env.PORT ?? "3001", 10)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Korri server requires a positive PORT")
  }

  return {
    host: env.HOST ?? "127.0.0.1",
    port,
    advertise: isEnabled(env.KORRI_SERVER_ADVERTISE_ENABLED ?? "1"),
    advertiseName: env.KORRI_STREAM_ADVERTISE_NAME ?? env.KORRI_SERVER_NAME,
    advertiseHostId: env.KORRI_STREAM_ADVERTISE_HOST_ID ?? env.KORRI_SERVER_ID,
    advertiseCapabilities: parseCapabilities(
      env.KORRI_STREAM_ADVERTISE_CAPABILITIES ?? "stream,source",
    ),
  }
}

export function createKorriServer(
  options: CreateKorriServerOptions = {},
): KorriServerHandle {
  const config = options.config ?? getKorriServerConfig()
  const app = createHonoApp({
    rpcHandler: serverRpcHandler,
    rpcSurface: "server",
  })
  const server = createAdaptorServer({ fetch: app.fetch })
  const advertise = options.advertise ?? advertiseStreamHost
  let advertisement: StreamAdvertisement | undefined
  let started = false

  return {
    start: async () => {
      if (started) return
      await listen(server, config.port, config.host)
      started = true
      try {
        if (config.advertise) {
          advertisement = advertise({
            name: config.advertiseName,
            hostId: config.advertiseHostId,
            port: config.port,
            capabilities: config.advertiseCapabilities,
          })
        }
      } catch (error) {
        await closeServer(server)
        started = false
        throw error
      }
      logger.info(
        `Korri server listening on http://${config.host}:${config.port}`,
      )
    },
    stop: async () => {
      if (advertisement) {
        await advertisement.stop()
        advertisement = undefined
      }
      if (started) {
        await closeServer(server)
        started = false
      }
    },
  }
}

export async function main(): Promise<void> {
  const server = createKorriServer()

  const gracefulShutdown = async (signal: string) => {
    logger.debug(`Received ${signal}, shutting down Korri server...`)
    try {
      await server.stop()
      process.exit(0)
    } catch (error) {
      logger.error({ err: error }, "Error during Korri server shutdown")
      process.exit(1)
    }
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
  process.on("SIGINT", () => gracefulShutdown("SIGINT"))

  try {
    await server.start()
  } catch (error) {
    logger.error({ err: error }, "Failed to start Korri server")
    process.exit(1)
  }
}

function listen(
  server: ReturnType<typeof createAdaptorServer>,
  port: number,
  host: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, host, () => resolve())
  })
}

function closeServer(
  server: ReturnType<typeof createAdaptorServer>,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === "ERR_SERVER_NOT_RUNNING") {
          resolve()
          return
        }
        reject(error)
        return
      }
      resolve()
    })
  })
}

function parseCapabilities(value: string): readonly string[] {
  const capabilities = value
    .split(",")
    .map(capability => capability.trim())
    .filter(Boolean)
  return capabilities.length > 0 ? capabilities : ["stream", "source"]
}

function isEnabled(value: string): boolean {
  return ["1", "true", "yes"].includes(value.trim().toLowerCase())
}

if (require.main === module) {
  main().catch(error => {
    logger.error({ err: error }, "Fatal Korri server error")
    process.exit(1)
  })
}
