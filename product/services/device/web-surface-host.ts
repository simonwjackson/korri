import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { createDesktopApp } from "../../apps/desktop/create-desktop-app"
import { makeForwarderUpstream } from "../../apps/desktop/forwarder-upstream"
import { readRuntimeConfigFromEnv } from "../../apps/desktop/runtime-config"
import type { RuntimeConfig } from "../../apps/desktop/runtime-config-shape"

const DEFAULT_HOSTNAME = "127.0.0.1"
const DEFAULT_PORT = 8099
const DEFAULT_UPSTREAM_BASE_URL = "http://127.0.0.1:3001"
const DEFAULT_IDLE_TIMEOUT_SECONDS = 255

export interface WebSurfaceHostConfig {
  readonly assetRoot: string
  readonly hostname: string
  readonly port: number
  readonly upstreamBaseUrl: string
  readonly statusFile?: string
  readonly idleTimeoutSeconds?: number
}

export interface CreateWebSurfaceHostAppOptions {
  readonly assetRoot: string
  readonly getUpstream: () => string | undefined | Promise<string | undefined>
  readonly invalidateUpstream?: () => void
  readonly getRuntimeConfig?: () => RuntimeConfig
  readonly onRendererReady?: (payload: unknown) => void | Promise<void>
}

export interface WebSurfaceHostHandle {
  readonly hostname: string
  readonly port: number
  stop: () => void
}

export function readWebSurfaceHostConfigFromEnv(
  env: Record<string, string | undefined>,
): WebSurfaceHostConfig {
  const assetRoot = trimmedValue(env.KORRI_ASSET_ROOT)
  if (!assetRoot) throw new Error("KORRI_ASSET_ROOT is required")

  return {
    assetRoot,
    hostname: trimmedValue(env.KORRI_WEB_SURFACE_HOST) ?? DEFAULT_HOSTNAME,
    port: parsePort(env.KORRI_WEB_SURFACE_PORT, DEFAULT_PORT),
    upstreamBaseUrl:
      trimmedValue(env.KORRI_LOOPBACK_BASE_URL) ?? DEFAULT_UPSTREAM_BASE_URL,
    ...(trimmedValue(env.KORRI_DESKTOP_STATUS_FILE)
      ? { statusFile: trimmedValue(env.KORRI_DESKTOP_STATUS_FILE) }
      : {}),
  }
}

export function createWebSurfaceHostApp(
  options: CreateWebSurfaceHostAppOptions,
): { fetch: (request: Request) => Promise<Response> } {
  const app = createDesktopApp({
    assetRoot: options.assetRoot,
    getUpstream: options.getUpstream,
    ...(options.invalidateUpstream
      ? { invalidateUpstream: options.invalidateUpstream }
      : {}),
    ...(options.getRuntimeConfig
      ? { getRuntimeConfig: options.getRuntimeConfig }
      : {}),
  })
  const innerFetch = app.fetch.bind(app)

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)
      if (
        request.method === "POST" &&
        url.pathname === "/__korri/renderer-ready"
      ) {
        const payload = await request.json().catch(() => ({}))
        await options.onRendererReady?.(payload)
        return new Response(null, { status: 204 })
      }

      return innerFetch(request)
    },
  }
}

interface WebSurfaceServerLike {
  readonly port?: number
  stop: (closeActiveConnections?: boolean) => void
}

interface WebSurfaceServeOptions {
  readonly hostname: string
  readonly port: number
  readonly idleTimeout: number
  readonly fetch: (request: Request) => Promise<Response>
}

export function startKorriWebSurfaceHost(
  config: WebSurfaceHostConfig,
  env: Record<string, string | undefined> = process.env,
  serve: (options: WebSurfaceServeOptions) => WebSurfaceServerLike = Bun.serve,
): WebSurfaceHostHandle {
  const forwarder = makeForwarderUpstream({
    loopbackBaseUrl: config.upstreamBaseUrl,
    allowRemoteApiBootstrap: false,
  })
  const app = createWebSurfaceHostApp({
    assetRoot: config.assetRoot,
    getUpstream: () => forwarder.pickUpstream(),
    invalidateUpstream: () => forwarder.invalidate(),
    getRuntimeConfig: () => readRuntimeConfigFromEnv(env),
    onRendererReady: async payload => {
      if (!config.statusFile) return
      await writeRendererStatusFile(config.statusFile, payload)
    },
  })

  const server = serve({
    hostname: config.hostname,
    port: config.port,
    idleTimeout: config.idleTimeoutSeconds ?? DEFAULT_IDLE_TIMEOUT_SECONDS,
    fetch: request => app.fetch(request),
  })

  return {
    hostname: config.hostname,
    port: server.port ?? config.port,
    stop: () => {
      server.stop(true)
    },
  }
}

async function writeRendererStatusFile(
  statusFile: string,
  payload: unknown,
): Promise<void> {
  await mkdir(dirname(statusFile), { recursive: true })
  await writeFile(
    statusFile,
    `${JSON.stringify({ ready: true, at: new Date().toISOString(), payload })}\n`,
  )
}

function parsePort(value: string | undefined, fallback: number): number {
  const trimmed = trimmedValue(value)
  if (!trimmed) return fallback
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new Error(`invalid KORRI_WEB_SURFACE_PORT: ${value}`)
  }
  return parsed
}

function trimmedValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}

if (import.meta.main) {
  const config = readWebSurfaceHostConfigFromEnv(process.env)
  const handle = startKorriWebSurfaceHost(config)
  console.log(
    `korri web-surface host on http://${config.hostname}:${handle.port}/`,
  )

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      handle.stop()
      process.exit(0)
    })
  }
}
