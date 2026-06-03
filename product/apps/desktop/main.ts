import { join } from "node:path"
import { logger } from "@shared/logger"
import { Effect, Fiber } from "effect"
import Electrobun, {
  ApplicationMenu,
  BrowserWindow,
  PATHS,
} from "electrobun/bun"
import { createDesktopApp } from "./create-desktop-app"
import {
  type ForwarderUpstream,
  makeForwarderUpstream,
} from "./forwarder-upstream"
import { createDesktopInputBroker } from "./input-broker"
import { installInputDispatchBootstrap } from "./input-dispatch-bootstrap"
import {
  desktopInputdUrlFromEnv,
  readRuntimeConfigFromEnv,
} from "./runtime-config"
import type { RuntimeConfig } from "./runtime-config-shape"
import { writeDesktopStatusFile } from "./status-file"
import {
  createDesktopDualScreenWindowOptions,
  createDesktopWindowOptions,
  type DesktopProfile,
  type DesktopServerAddress,
  desktopProfileFromEnv,
} from "./window-options"

const DESKTOP_HOST = "127.0.0.1"
const assetRoot = join(PATHS.VIEWS_FOLDER, "mainview")

let server: ReturnType<typeof Bun.serve> | null = null
let windows: BrowserWindow[] = []

let inputBrokerFiber: Fiber.Fiber<never, never> | null = null

function installApplicationMenu() {
  ApplicationMenu.setApplicationMenu([
    {
      submenu: [{ role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
  ])
}

function stopDesktopControlPlane() {
  if (server) {
    server.stop(true)
    server = null
  }
  if (inputBrokerFiber) {
    Effect.runFork(Fiber.interrupt(inputBrokerFiber))
    inputBrokerFiber = null
  }
}

function registerProcessShutdown() {
  process.on("exit", stopDesktopControlPlane)
  process.on("SIGINT", () => {
    stopDesktopControlPlane()
    process.exit(0)
  })
  process.on("SIGTERM", () => {
    stopDesktopControlPlane()
    process.exit(0)
  })
}

async function main() {
  // Federation v1: the forwarder upstream picker browses mDNS + probes
  // loopback on demand (see forwarder-upstream.ts). The renderer treats
  // `503 no upstream` as an empty rail (R3 / AE1).
  const forwarderUpstream: ForwarderUpstream = makeForwarderUpstream({
    loopbackBaseUrl: process.env.KORRI_LOOPBACK_BASE_URL ?? undefined,
  })
  const getUpstream = () => forwarderUpstream.pickUpstream()
  const invalidateUpstream = () => forwarderUpstream.invalidate()

  // Runtime-config is read once at startup and inlined into the
  // served index.html via the bun-side Hono composition. Renderer
  // reads `window.__korriRuntimeConfig` synchronously at boot.
  const runtimeConfig: RuntimeConfig = readRuntimeConfigFromEnv(process.env)
  const getRuntimeConfig = () => runtimeConfig

  // Launch ownership moved to korri-server + korri-sessiond. The bun
  // process no longer owns any foreground session — every launch goes
  // through `app.library.launch`, which dispatches via sessiond. The
  // renderer's gate state now polls `app.server.status` over standard
  // `/api/rpc` (see foreground-session-status-layer-live.ts); the
  // previous `/__korri/desktop/foreground-session-status` bun bridge
  // endpoint has been removed.

  const app = createDesktopApp({
    assetRoot,
    getUpstream,
    invalidateUpstream,
    getRuntimeConfig,
  })

  server = Bun.serve({
    hostname: DESKTOP_HOST,
    port: 0,
    fetch: app.fetch,
  })

  installApplicationMenu()
  registerProcessShutdown()

  const port = server.port
  if (!port) {
    throw new Error("Desktop server did not bind to a port")
  }

  const profile = desktopProfileFromEnv()
  const preloadPath = resolvePreloadPath()
  const windowOptions = createDesktopWindows(
    { host: DESKTOP_HOST, port },
    profile,
    { preload: preloadPath },
  )
  const activeWindowProvider = createActiveWindowProvider(() => windows)
  windows = windowOptions.map(options => new BrowserWindow(options))
  for (const window of windows) {
    const installDispatch = () => installInputDispatchBootstrap(window, logger)
    window.webview.on("dom-ready", installDispatch)
    installDispatch()
  }

  const inputdUrl = desktopInputdUrlFromEnv(process.env)
  if (runtimeConfig.desktopInput && inputdUrl) {
    inputBrokerFiber = Effect.runFork(
      createDesktopInputBroker({
        inputdUrl,
        getWindows: () => windows,
        getActiveWindow: activeWindowProvider.getActiveWindow,
        onActiveChange: activeWindowProvider.onActiveChange,
      }),
    )
  }

  if (process.env.KORRI_DESKTOP_STATUS_FILE) {
    await writeDesktopStatusFile({
      path: process.env.KORRI_DESKTOP_STATUS_FILE,
      url: windowOptions[0]?.url ?? `http://${DESKTOP_HOST}:${port}/`,
      pid: process.pid,
      profile,
    })
  }

  logger.info(
    {
      urls: windowOptions.map(options => options.url),
      assetRoot,
      windowTitles: windows.map(window => window.title),
      profile,
      statusFile: process.env.KORRI_DESKTOP_STATUS_FILE,
      runtimeConfig,
    },
    "Korri desktop app started",
  )
}

function createDesktopWindows(
  address: DesktopServerAddress,
  profile: DesktopProfile,
  options: { readonly preload?: string } = {},
) {
  if (process.env.KORRI_DESKTOP_DUAL_SCREEN === "1") {
    const dual = createDesktopDualScreenWindowOptions(address, options)
    return [dual.primary, dual.companion]
  }

  return [createDesktopWindowOptions(address, profile, options)]
}

function createActiveWindowProvider(
  getWindows: () => readonly BrowserWindow[],
) {
  let activeWindowId: number | null = null

  const listeners = new Set<(active: boolean) => void>()
  const getActiveWindow = () =>
    getWindows().find(window => window.id === activeWindowId) ?? null
  const notify = () => {
    const active = Boolean(getActiveWindow())
    for (const listener of listeners) listener(active)
  }

  Electrobun.events.on("focus", event => {
    activeWindowId = event.data.id
    notify()
  })
  Electrobun.events.on("blur", event => {
    if (activeWindowId === event.data.id) {
      activeWindowId = null
      notify()
    }
  })

  return {
    getActiveWindow,
    onActiveChange: (listener: (active: boolean) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function resolvePreloadPath(): string | undefined {
  // electrobun.config.ts copies the preload bundle into views/mainview/.
  const preload = join(PATHS.VIEWS_FOLDER, "mainview", "preload.js")
  return preload
}

main().catch(error => {
  logger.error({ err: error }, "Failed to start Korri desktop app")
  stopDesktopControlPlane()
  process.exit(1)
})
