import { join } from "node:path"
import { logger } from "@shared/logger"
import { Effect, Exit, Scope, Stream, SubscriptionRef } from "effect"
import { ApplicationMenu, BrowserWindow, PATHS } from "electrobun/bun"
import { watchStreamHosts } from "../../../tools/cli/lan-stream-discovery"
import {
  type ConnectionState,
  makeConnectionController,
} from "./connection"
import { createDesktopApp } from "./create-desktop-app"
import { loadDesktopConfig, saveDesktopConfig } from "./desktop-config"
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
let controllerScope: Scope.Closeable | null = null

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

function stopDesktopServer() {
  if (server) {
    server.stop(true)
    server = null
  }
  if (controllerScope) {
    Effect.runFork(Scope.close(controllerScope, Exit.succeed(undefined)))
    controllerScope = null
  }
}

function registerProcessShutdown() {
  process.on("exit", stopDesktopServer)
  process.on("SIGINT", () => {
    stopDesktopServer()
    process.exit(0)
  })
  process.on("SIGTERM", () => {
    stopDesktopServer()
    process.exit(0)
  })
}

async function main() {
  const scope = Scope.makeUnsafe()
  controllerScope = scope
  const controller = await Effect.runPromise(
    Effect.provideService(
      makeConnectionController({
        watcher: watchStreamHosts(),
        loadConfig: Effect.tryPromise({
          try: () => loadDesktopConfig(),
          catch: error => error,
        }),
        saveConfig: partial =>
          Effect.tryPromise({
            try: () => saveDesktopConfig(process.env, partial),
            catch: error => error,
          }),
        httpProbe: probeUpstream,
      }),
      Scope.Scope,
      scope,
    ),
  )

  const getUpstream = () => {
    const state = SubscriptionRef.getUnsafe(controller.state)
    return state.status === "connected" ? state.server.controlUrl : undefined
  }

  const app = createDesktopApp({ assetRoot, getUpstream })

  server = Bun.serve({
    hostname: DESKTOP_HOST,
    port: 0,
    fetch: app.fetch,
  })

  // For now we only log connection-state transitions; U5 wires the push
  // into BrowserWindows.
  Effect.runFork(
    Effect.provideService(
      logConnectionStateChanges(controller.state),
      Scope.Scope,
      scope,
    ),
  )

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
  windows = windowOptions.map(options => new BrowserWindow(options))

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

function resolvePreloadPath(): string | undefined {
  // electrobun.config.ts copies the preload bundle into views/mainview/.
  const preload = join(PATHS.VIEWS_FOLDER, "mainview", "preload.js")
  return preload
}

main().catch(error => {
  logger.error({ err: error }, "Failed to start Korri desktop app")
  stopDesktopServer()
  process.exit(1)
})

function logConnectionStateChanges(
  state: SubscriptionRef.SubscriptionRef<ConnectionState>,
) {
  return SubscriptionRef.changes(state).pipe(
    Stream.runForEach(snapshot =>
      Effect.sync(() =>
        logger.info({ status: snapshot.status }, "connection state"),
      ),
    ),
  )
}

function probeUpstream(controlUrl: string): Effect.Effect<boolean> {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${controlUrl}/api/health`, {
        signal: AbortSignal.timeout(500),
      })
      return response.ok
    },
    catch: () => false,
  }).pipe(Effect.orElseSucceed(() => false))
}
