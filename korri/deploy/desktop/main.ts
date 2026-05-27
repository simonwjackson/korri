import { join } from "node:path"
import {
  launchMoonlight,
  preflightMoonlightInput,
} from "@app/stream/moonlight-launcher"
import { createRemoteStreamControlClient } from "@app/stream/remote-stream-client"
import { korriDataPath } from "@shared/config/xdg-paths"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { createLibraryRepository } from "@shared/library/proseql/library-repository"
import { logger } from "@shared/logger"
import { Effect, Exit, Fiber, Scope, Stream, SubscriptionRef } from "effect"
import Electrobun, {
  ApplicationMenu,
  BrowserWindow,
  PATHS,
} from "electrobun/bun"
import { watchStreamHosts } from "../../../tools/cli/lan-stream-discovery"
import {
  probeSwayTree,
  repairStreamSurface,
  snapshotStreamSurfaceIds,
  waitForStreamSurfaceAbsence,
} from "../../../tools/device/game-stream-fullscreen"
import type { SwayCommandRunner } from "../../../tools/device/sessiond-sway"
import { type ConnectionState, makeConnectionController } from "./connection"
import type {
  ConnectionServerRecord,
  ConnectionStateSnapshot,
} from "./connection-state-snapshot"
import { createDesktopApp } from "./create-desktop-app"
import {
  type ForwarderUpstream,
  makeForwarderUpstream,
} from "./forwarder-upstream"
import { loadDesktopConfig, saveDesktopConfig } from "./desktop-config"
import { foregroundSessionStatusSnapshotFromOwnerStatus } from "./foreground-session-status-snapshot"
import { createDesktopInputBroker } from "./input-broker"
import { installInputDispatchBootstrap } from "./input-dispatch-bootstrap"
import {
  createLaunchBridgeForegroundSessionOwner,
  type LaunchBridgeForegroundSessionOwner,
  type LaunchBridgeOptions,
} from "./launch-bridge"
import { createDesktopMoonlightSessionRunner } from "./moonlight-session-runner"
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
let controllerScope: Scope.Closeable | null = null
let inputBrokerFiber: Fiber.Fiber<never, never> | null = null
let foregroundSessionOwner: LaunchBridgeForegroundSessionOwner | null = null

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
  if (controllerScope) {
    Effect.runFork(Scope.close(controllerScope, Exit.succeed(undefined)))
    controllerScope = null
  }
  if (inputBrokerFiber) {
    Effect.runFork(Fiber.interrupt(inputBrokerFiber))
    inputBrokerFiber = null
  }
}

function stopDesktopServer() {
  stopDesktopControlPlane()
  foregroundSessionOwner?.terminateActiveSessionNow()
  foregroundSessionOwner = null
}

async function stopDesktopServerGracefully() {
  stopDesktopControlPlane()
  const owner = foregroundSessionOwner
  foregroundSessionOwner = null
  await owner?.terminateActiveSession()
}

function registerProcessShutdown() {
  process.on("exit", stopDesktopServer)
  process.on("SIGINT", async () => {
    await stopDesktopServerGracefully()
    process.exit(0)
  })
  process.on("SIGTERM", async () => {
    await stopDesktopServerGracefully()
    process.exit(0)
  })
}

async function main() {
  const scope = Scope.makeUnsafe()
  controllerScope = scope

  // Tee the mDNS event stream so we can log each candidate as it appears
  // — the controller alone is silent and a slow probe / mismatched URL
  // would otherwise be invisible.
  const rawWatcher = watchStreamHosts()
  const watcher = rawWatcher.pipe(
    Stream.tap(event =>
      Effect.sync(() => {
        if (event.kind === "appear") {
          logger.info(
            {
              controlUrl: event.candidate.controlUrl,
              hostId: event.candidate.id,
              capabilities: event.candidate.capabilities,
            },
            "mdns: stream host appeared",
          )
        } else {
          logger.info(
            { controlUrl: event.controlUrl },
            "mdns: stream host disappeared",
          )
        }
      }),
    ),
  )

  const controller = await Effect.runPromise(
    Effect.provideService(
      makeConnectionController({
        watcher,
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

  // Federation v1 upstream picker. Replaces the connection-state-machine
  // read for the forwarder hot path; the connection state machine still
  // owns the waiting-page decision (U8 deletes that surface).
  const forwarderUpstream: ForwarderUpstream = makeForwarderUpstream({
    loopbackBaseUrl: process.env.KORRI_LOOPBACK_BASE_URL ?? undefined,
  })
  const getUpstream = () => forwarderUpstream.pickUpstream()
  const invalidateUpstream = () => forwarderUpstream.invalidate()

  const getConnection = (): ConnectionServerRecord | undefined => {
    const state = SubscriptionRef.getUnsafe(controller.state)
    return state.status === "connected" ? state.server : undefined
  }

  // Snapshot accessor consumed by the catch-all serve branch (waiting
  // page vs React bundle) and by `/__korri/desktop/connection-status`.
  // The controller holds `Date` objects; the snapshot's wire shape is
  // ISO strings. Conversion happens here at the accessor seam so the
  // composition stays JSON-typed at the HTTP boundary.
  const getConnectionState = () => snapshotFromControllerState(controller.state)

  // Runtime-config is read once at startup and inlined into the
  // served index.html via the bun-side Hono composition. Renderer
  // reads `window.__korriRuntimeConfig` synchronously at boot.
  const runtimeConfig: RuntimeConfig = readRuntimeConfigFromEnv(process.env)
  const getRuntimeConfig = () => runtimeConfig

  const launchBridgeOptions: LaunchBridgeOptions = {
    getConnection,
    readinessCooldownMs: 750,
    // Construct a one-shot RemoteStreamControlClient per request so
    // a reconnection between launches uses fresh wiring. The client is
    // cheap to build; the underlying RPC layer is a stateless
    // FetchHttpClient with serializer.
    prepareGame: async (controlUrl, id) => {
      const client = createRemoteStreamControlClient(controlUrl, {
        timeoutMs: 5_000,
      })
      return await client.prepareGame(id)
    },
    preflightMoonlightInput,
    resolveMoonlightGamescope: resolveLocalMoonlightGamescopePolicy,
    moonlightForegroundRepair: createLocalMoonlightForegroundRepair(),
    launchMoonlight: opts =>
      launchMoonlight({
        host: opts.host,
        gamescope: opts.gamescope,
        runner: diagnosticMoonlightRunner,
      }),
  }
  foregroundSessionOwner =
    createLaunchBridgeForegroundSessionOwner(launchBridgeOptions)

  const getForegroundSessionStatus = () => {
    const owner = foregroundSessionOwner
    return foregroundSessionStatusSnapshotFromOwnerStatus({
      status: owner?.status() ?? { state: { _tag: "IdleReady" }, events: [] },
    })
  }

  const app = createDesktopApp({
    assetRoot,
    getUpstream,
    invalidateUpstream,
    getConnectionState,
    getRuntimeConfig,
    getForegroundSessionStatus,
    launchBridge: {
      ...launchBridgeOptions,
      foregroundSessionOwner,
    },
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

async function resolveLocalMoonlightGamescopePolicy() {
  const configuredRoot = process.env.KORRI_LIBRARY_ROOT?.trim()
  const root =
    configuredRoot && configuredRoot.length > 0
      ? configuredRoot
      : korriDataPath(process.env, "library")

  return await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriLibraryDb({ root })
        const repository = createLibraryRepository(db)
        const policy =
          yield* repository.resolveLocalLauncherGamescopePolicy("moonlight")
        return {
          enabled: policy.enabled === true,
          ...(policy.command !== undefined ? { command: policy.command } : {}),
          ...(policy.args !== undefined ? { args: policy.args } : {}),
        }
      }),
    ),
  )
}

function createLocalMoonlightForegroundRepair() {
  if (!process.env.SWAYSOCK) return undefined

  const runner = createSwayCommandRunner(
    commandFromEnv("KORRI_GAME_STREAM_SWAYMSG_COMMAND", "swaymsg"),
  )
  const selector = {}
  return {
    snapshotSurfaceIds: () => snapshotStreamSurfaceIds({ runner, selector }),
    repairSurface: ({
      ignoredWindowIds,
    }: {
      ignoredWindowIds: ReadonlySet<number>
    }) => repairStreamSurface({ runner, selector, ignoredWindowIds }),
    waitForSurfaceAbsence: ({
      ownedWindowIds,
      ignoredWindowIds,
      signal,
    }: {
      ownedWindowIds: ReadonlySet<number>
      ignoredWindowIds: ReadonlySet<number>
      signal: AbortSignal
    }) =>
      waitForStreamSurfaceAbsence({
        runner,
        selector,
        ownedWindowIds,
        ignoredWindowIds,
        signal,
      }).then(result => ({ ...result })),
    probeCompositor: () =>
      probeSwayTree({ runner, selector }).then(result => ({ ...result })),
  }
}

function createSwayCommandRunner(
  command: string,
  timeoutMs = 2_000,
): SwayCommandRunner {
  return {
    async run(args) {
      const proc = Bun.spawn([command, ...args], {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
      const timedOut = Symbol("timedOut")
      const timeout = new Promise<typeof timedOut>(resolve => {
        setTimeout(() => resolve(timedOut), timeoutMs)
      })
      const exit = await Promise.race([proc.exited, timeout])
      if (exit === timedOut) {
        proc.kill("SIGKILL")
        throw new Error(`swaymsg timed out after ${timeoutMs}ms`)
      }

      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      if (exit !== 0) throw new Error(stderr || `swaymsg exited ${exit}`)
      return stdout
    },
  }
}

function commandFromEnv(name: string, fallback: string): string {
  const trimmed = process.env[name]?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
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

// Diagnostic runner: spawns moonlight with piped output and returns a
// managed child handle. Ownership and termination live above this runner;
// starting a new child never kills an existing one.
const diagnosticMoonlightRunner = createDesktopMoonlightSessionRunner({
  spawn: (command, args, options) => {
    const child = Bun.spawn([command, ...args], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: options?.env ? { ...Bun.env, ...options.env } : Bun.env,
    })
    return {
      ...child,
      kill: signal => child.kill(signal === "SIGKILL" ? "SIGKILL" : "SIGTERM"),
    }
  },
})

main().catch(async error => {
  logger.error({ err: error }, "Failed to start Korri desktop app")
  await stopDesktopServerGracefully()
  process.exit(1)
})

// Map the controller's `Date`-typed state to the wire-shape snapshot
// the Hono composition consumes. Single conversion seam.
function snapshotFromControllerState(
  ref: SubscriptionRef.SubscriptionRef<ConnectionState>,
): ConnectionStateSnapshot {
  const state = SubscriptionRef.getUnsafe(ref)
  if (state.status === "connected") {
    return { status: "connected", server: state.server }
  }
  if (state.status === "reconnecting") {
    return {
      status: "reconnecting",
      server: state.server,
      since: state.since.toISOString(),
      helpAfter: state.helpAfter.toISOString(),
    }
  }
  return {
    status: "searching",
    since: state.since.toISOString(),
    helpAfter: state.helpAfter.toISOString(),
  }
}

const PROBE_TIMEOUT_MS = 3000

function probeUpstream(controlUrl: string): Effect.Effect<boolean> {
  const url = `${controlUrl}/api/health`
  return Effect.tryPromise({
    try: async () => {
      const start = performance.now()
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
        const elapsedMs = Math.round(performance.now() - start)
        logger.info(
          { controlUrl, status: response.status, elapsedMs },
          "probeUpstream: response",
        )
        return response.ok
      } catch (error) {
        const elapsedMs = Math.round(performance.now() - start)
        logger.warn(
          { controlUrl, elapsedMs, err: error },
          "probeUpstream: fetch failed",
        )
        throw error
      }
    },
    catch: () => false,
  }).pipe(Effect.orElseSucceed(() => false))
}
