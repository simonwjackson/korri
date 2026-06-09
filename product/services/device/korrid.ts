#!/usr/bin/env node

import { createAdaptorServer } from "@hono/node-server"
import { logger } from "@platform/logger"
import { createHonoApp } from "@product/apps/portal/api/hono-app"
import { serverRpcHandler } from "@product/apps/portal/api/server/rpc-server"
import {
  advertiseStreamHost,
  type StreamAdvertisement,
} from "./lan-stream-advertise"

export interface KorridConfig {
  readonly host: string
  readonly port: number
  readonly advertise: boolean
  readonly advertiseName?: string
  readonly advertiseHostId?: string
  readonly advertiseCapabilities: readonly string[]
}

export interface KorridHandle {
  readonly start: () => Promise<void>
  readonly stop: () => Promise<void>
}

export interface CreateKorridOptions {
  readonly config?: KorridConfig
  readonly advertise?: (options: {
    readonly name?: string
    readonly hostId?: string
    readonly port: number
    readonly capabilities: readonly string[]
  }) => StreamAdvertisement
}

export function getKorridConfig(
  env: NodeJS.ProcessEnv = process.env,
): KorridConfig {
  const port = Number.parseInt(env.PORT ?? "3001", 10)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Korri daemon requires a positive PORT")
  }

  return {
    host: env.HOST ?? "127.0.0.1",
    port,
    // Federation v1: every library-bearing korrid advertises
    // unconditionally. The legacy KORRI_SERVER_ADVERTISE_ENABLED knob is
    // gone (R14 / zero-backwards-compat). Devices that should not
    // participate in federation simply don't run korrid.
    advertise: true,
    advertiseName: env.KORRI_STREAM_ADVERTISE_NAME ?? env.KORRI_DAEMON_NAME,
    advertiseHostId: env.KORRI_STREAM_ADVERTISE_HOST_ID ?? env.KORRI_DAEMON_ID,
    advertiseCapabilities: parseCapabilities(
      env.KORRI_STREAM_ADVERTISE_CAPABILITIES ?? "source,stream",
    ),
  }
}

export function createKorrid(options: CreateKorridOptions = {}): KorridHandle {
  const config = options.config ?? getKorridConfig()
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
        `Korri daemon listening on http://${config.host}:${config.port}`,
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
  const server = createKorrid()

  const gracefulShutdown = async (signal: string) => {
    logger.debug(`Received ${signal}, shutting down Korri daemon...`)
    try {
      await server.stop()
      process.exit(0)
    } catch (error) {
      logger.error({ err: error }, "Error during Korri daemon shutdown")
      process.exit(1)
    }
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
  process.on("SIGINT", () => gracefulShutdown("SIGINT"))

  try {
    await server.start()
  } catch (error) {
    logger.error({ err: error }, "Failed to start Korri daemon")
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

if (require.main === module) {
  main().catch(error => {
    logger.error({ err: error }, "Fatal Korri daemon error")
    process.exit(1)
  })
}
