#!/usr/bin/env node

import { createAdaptorServer } from "@hono/node-server"
import {
  type ConfigGraphController,
  createConfigGraphController,
} from "@platform/library/config-graph-controller"
import { resolveAllConfigGraphRoots } from "@platform/library/library-source-layer-live"
import { logger } from "@platform/logger"
import { createHonoApp } from "@product/apps/portal/api/hono-app"
import { createServerRpcHandler } from "@product/apps/portal/api/server/rpc-server"
import {
  createFirstPartyPluginRegistryFromEnv,
  firstPartyPluginDaemonsForRegistry,
  type KorriPluginDaemonHandle,
} from "@product/plugin-host"
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
  readonly pluginDaemons?: readonly KorriPluginDaemonHandle[]
  readonly closeServerTimeoutMs?: number
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
  // Roots re-resolve on every rebuild so removable media published into the
  // config-roots.d signal dir join (and leave) the live graph on hotplug.
  const configGraphController: ConfigGraphController =
    createConfigGraphController({
      resolveRoots: () => resolveAllConfigGraphRoots(),
      rootsSignalDir: process.env.KORRI_CONFIG_ROOTS_DIR,
    })
  const app = createHonoApp({
    rpcHandler: createServerRpcHandler({ configGraphController }),
    rpcSurface: "server",
    configGraphController,
  })
  const server = createAdaptorServer({ fetch: app.fetch })
  const advertise = options.advertise ?? advertiseStreamHost
  const pluginDaemons =
    options.pluginDaemons ??
    firstPartyPluginDaemonsForRegistry(createFirstPartyPluginRegistryFromEnv())
  let advertisement: StreamAdvertisement | undefined
  let started = false

  return {
    start: async () => {
      if (started) return
      for (const daemon of pluginDaemons) await daemon.start()
      try {
        await configGraphController.initialize()
      } catch (error) {
        logger.warn(
          { err: error },
          "Korri daemon: config graph initialize failed; serving empty baseline",
        )
      }
      try {
        await listen(server, config.port, config.host)
        started = true
      } catch (error) {
        for (const daemon of [...pluginDaemons].reverse()) await daemon.stop()
        await configGraphController.stop()
        throw error
      }
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
        for (const daemon of [...pluginDaemons].reverse()) await daemon.stop()
        await configGraphController.stop()
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
      for (const daemon of [...pluginDaemons].reverse()) await daemon.stop()
      await configGraphController.stop()
      if (started) {
        await closeServer(server, {
          timeoutMs: options.closeServerTimeoutMs ?? 1_500,
        })
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
  options: { readonly timeoutMs?: number } = {},
): Promise<void> {
  const closeableServer = server as ReturnType<typeof createAdaptorServer> & {
    readonly closeAllConnections?: () => void
    readonly closeIdleConnections?: () => void
  }
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const settle = (result: "resolve" | "reject", error?: unknown) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (result === "reject") reject(error)
      else resolve()
    }
    const timeoutMs = options.timeoutMs
    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            closeableServer.closeIdleConnections?.()
            closeableServer.closeAllConnections?.()
            settle("resolve")
          }, timeoutMs)
    if (timer && "unref" in timer && typeof timer.unref === "function")
      timer.unref()

    server.close(error => {
      if (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === "ERR_SERVER_NOT_RUNNING") {
          settle("resolve")
          return
        }
        settle("reject", error)
        return
      }
      settle("resolve")
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
