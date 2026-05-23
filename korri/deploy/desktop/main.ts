import { join } from "node:path"
import {
  type CommandRunner,
  launchMoonlight,
} from "@app/stream/moonlight-launcher"
import { createRemoteStreamControlClient } from "@app/stream/remote-stream-client"
import { logger } from "@shared/logger"
import { Effect, Exit, Fiber, Scope, Stream, SubscriptionRef } from "effect"
import Electrobun, {
  ApplicationMenu,
  BrowserWindow,
  PATHS,
} from "electrobun/bun"
import { watchStreamHosts } from "../../../tools/cli/lan-stream-discovery"
import { type ConnectionState, makeConnectionController } from "./connection"
import type { ConnectionServerRecord } from "./connection-state-bridge"
import { createDesktopApp } from "./create-desktop-app"
import { loadDesktopConfig, saveDesktopConfig } from "./desktop-config"
import { createDesktopInputBroker } from "./input-broker"
import {
  desktopInputdUrlFromEnv,
  readRuntimeConfigFromEnv,
} from "./runtime-config"
import type { RuntimeConfigBridgeState } from "./runtime-config-bridge"
import { writeDesktopStatusFile } from "./status-file"
import { toBridgeState } from "./to-bridge-state"
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
  if (inputBrokerFiber) {
    Effect.runFork(Fiber.interrupt(inputBrokerFiber))
    inputBrokerFiber = null
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

  const getUpstream = () => {
    const state = SubscriptionRef.getUnsafe(controller.state)
    return state.status === "connected" ? state.server.controlUrl : undefined
  }

  const getConnection = (): ConnectionServerRecord | undefined => {
    const state = SubscriptionRef.getUnsafe(controller.state)
    return state.status === "connected" ? state.server : undefined
  }

  const app = createDesktopApp({
    assetRoot,
    getUpstream,
    launchBridge: {
      getConnection,
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
      launchMoonlight: opts =>
        launchMoonlight({ host: opts.host, runner: diagnosticMoonlightRunner }),
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
  const runtimeConfig: RuntimeConfigBridgeState = readRuntimeConfigFromEnv(
    process.env,
  )
  const windowOptions = createDesktopWindows(
    { host: DESKTOP_HOST, port },
    profile,
    { preload: preloadPath },
  )
  const activeWindowProvider = createActiveWindowProvider(() => windows)
  windows = windowOptions.map(options => {
    const window = new BrowserWindow(options)
    attachInitialBridgePushes(window, controller.state, runtimeConfig)
    return window
  })

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

  // Push every connection-state transition (including the initial value,
  // which `SubscriptionRef.changes` re-emits to fresh subscribers) into
  // each open webview. The preload installs `window.__korriConnection`
  // and overrides `window.__electrobun.receiveMessageFromBun`, so this
  // payload reaches `useConnectionState` subscribers in the React shell.
  Effect.runFork(
    Effect.provideService(
      pushConnectionStateToWebviews(controller.state, () => windows),
      Scope.Scope,
      scope,
    ),
  )

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

function attachInitialBridgePushes(
  window: BrowserWindow,
  connectionState: SubscriptionRef.SubscriptionRef<ConnectionState>,
  runtimeConfig: RuntimeConfigBridgeState,
) {
  const push = () => {
    installWebviewBridgeFallback(window)
    const snapshot = SubscriptionRef.getUnsafe(connectionState)
    try {
      window.webview.sendMessageToWebviewViaExecute(toBridgeState(snapshot))
    } catch (error) {
      logger.warn(
        { err: error, windowTitle: window.title },
        "failed to push initial connection state to webview",
      )
    }
    try {
      window.webview.sendMessageToWebviewViaExecute(runtimeConfig)
    } catch (error) {
      logger.warn(
        { err: error, windowTitle: window.title },
        "failed to push runtime config to webview",
      )
    }
  }

  window.webview.on("dom-ready", push)
  push()
}

function installWebviewBridgeFallback(window: BrowserWindow) {
  const script = `
    (() => {
      if (window.__korriDesktopBridgeFallbackInstalled) return
      window.__korriDesktopBridgeFallbackInstalled = true

      const connectionListeners = new Set()
      const runtimeListeners = new Set()
      const actionListeners = new Set()
      const statusListeners = new Set()

      let connectionState = {
        status: "searching",
        since: new Date(0).toISOString(),
        helpAfter: new Date(0).toISOString(),
      }
      let runtimeState = { desktopInput: false }
      let inputStatus = {
        inputd: "disabled",
        active: false,
        decodedFrames: 0,
        emittedActions: 0,
        droppedActions: 0,
        pushFailures: 0,
        lastError: null,
      }

      if (!window.__korriConnection) {
        window.__korriConnection = {
          getState: () => connectionState,
          subscribe: listener => {
            connectionListeners.add(listener)
            return () => connectionListeners.delete(listener)
          },
        }
      }

      if (!window.__korriRuntime) {
        window.__korriRuntime = {
          getState: () => runtimeState,
          subscribe: listener => {
            runtimeListeners.add(listener)
            return () => runtimeListeners.delete(listener)
          },
        }
      }

      if (!window.__korriInput) {
        window.__korriInput = {
          subscribeAction: listener => {
            actionListeners.add(listener)
            return () => actionListeners.delete(listener)
          },
          getStatus: () => inputStatus,
          subscribeStatus: listener => {
            statusListeners.add(listener)
            return () => statusListeners.delete(listener)
          },
        }
      }

      if (!window.__electrobun) window.__electrobun = {}
      const previous = window.__electrobun.receiveMessageFromBun
      window.__electrobun.receiveMessageFromBun = incoming => {
        if (typeof previous === "function") {
          try {
            previous(incoming)
          } catch (error) {
            console.warn("[korri] prior bridge acceptor threw", error)
          }
        }

        try {
          if (incoming && typeof incoming === "object") {
            if (
              typeof incoming.status === "string" &&
              (incoming.status === "connected" || typeof incoming.since === "string")
            ) {
              connectionState = incoming
              for (const listener of connectionListeners) listener(incoming)
            }

            if (typeof incoming.desktopInput === "boolean") {
              runtimeState = incoming
              for (const listener of runtimeListeners) listener(incoming)
            }

            if (incoming.kind === "korri.input.action" && incoming.action) {
              for (const listener of actionListeners) listener(incoming.action)
            }

            if (incoming.kind === "korri.input.status" && incoming.status) {
              inputStatus = incoming.status
              for (const listener of statusListeners) listener(incoming.status)
            }
          }
        } catch (error) {
          console.warn("[korri] fallback bridge acceptor threw", error)
        }
      }
    })()
  `

  try {
    window.webview.executeJavascript(script)
  } catch (error) {
    logger.warn(
      { err: error, windowTitle: window.title },
      "failed to install webview bridge fallback",
    )
  }
}

function resolvePreloadPath(): string | undefined {
  // electrobun.config.ts copies the preload bundle into views/mainview/.
  const preload = join(PATHS.VIEWS_FOLDER, "mainview", "preload.js")
  return preload
}

// Diagnostic runner: spawns moonlight with piped stderr, logs the first
// 4KB of output that arrives within 4s of the spawn. This is how we
// learn *why* moonlight bails (display missing, host unpaired, etc.)
// when the desktop bridge spawns it. The CLI variant of the launch
// flow inherits the user's interactive shell stdio so any complaint
// surfaces in the terminal; the desktop bridge's Bun.spawn previously
// piped everything to /dev/null, which is why crashes here were
// invisible. The child is still unref'd — the desktop process never
// waits for moonlight.
const diagnosticMoonlightRunner: CommandRunner = {
  run: async (command, args, options) => {
    try {
      const child = Bun.spawn([command, ...args], {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
      // Fire-and-forget: drain the first 4KB from each stream within
      // 4 seconds, log it, then drop the reader (the process keeps
      // running). We don't await this — the bridge handler must return
      // quickly so the renderer's launch state can settle.
      void collectAndLogMoonlightOutput(child, command, args)
      const observedExit = await observeMoonlightStartupExit(
        child,
        options?.startupObserveMs,
      )
      if (observedExit !== undefined && observedExit !== 0) {
        return {
          status: "failed",
          message: `Moonlight exited early with status ${observedExit}`,
        }
      }
      child.unref?.()
      return { status: "started" }
    } catch (error) {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

async function observeMoonlightStartupExit(
  child: ReturnType<typeof Bun.spawn>,
  startupObserveMs: number | undefined,
): Promise<number | undefined> {
  if (!startupObserveMs || startupObserveMs <= 0) return undefined
  return Promise.race([
    child.exited,
    new Promise<undefined>(resolve => setTimeout(resolve, startupObserveMs)),
  ])
}

async function collectAndLogMoonlightOutput(
  child: ReturnType<typeof Bun.spawn>,
  command: string,
  args: readonly string[],
): Promise<void> {
  // We must drain stdout/stderr *continuously* for as long as moonlight
  // runs. If we only read the first N bytes and stop, the kernel pipe
  // buffer (~64KB) fills and moonlight's next write blocks, freezing
  // it. That bug bit the first version of this diagnostic.
  //
  // Strategy:
  //   - Drain both streams forever in the background.
  //   - Buffer only the first SNAPSHOT_BYTES bytes per stream; discard
  //     the rest. This bounds memory while keeping the pipe drained.
  //   - After SNAPSHOT_DELAY_MS, log the snapshot + early exit code
  //     (if any). The continued drain keeps moonlight alive afterward.
  //   - When the child exits, log a final line with the real exit code.

  const SNAPSHOT_BYTES = 4 * 1024
  const SNAPSHOT_DELAY_MS = 4_000

  const snapshotOf = (stream: ReadableStream<Uint8Array> | undefined) => {
    const snapshotChunks: Uint8Array[] = []
    let bytesKept = 0
    let snapshotReady = false
    const snapshotReadyResolvers: Array<() => void> = []
    const onSnapshotReady = () =>
      new Promise<void>(resolve => {
        if (snapshotReady) resolve()
        else snapshotReadyResolvers.push(resolve)
      })
    const markSnapshotReady = () => {
      if (snapshotReady) return
      snapshotReady = true
      for (const resolve of snapshotReadyResolvers) resolve()
    }
    const consume = async () => {
      if (!stream) return
      const reader = stream.getReader()
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          if (!value || !snapshotReady) {
            const room = SNAPSHOT_BYTES - bytesKept
            if (room > 0 && value) {
              const take =
                value.byteLength > room ? value.slice(0, room) : value
              snapshotChunks.push(take)
              bytesKept += take.byteLength
              if (bytesKept >= SNAPSHOT_BYTES) markSnapshotReady()
            }
          }
          // Otherwise discard the chunk; we just need the pipe drained.
        }
      } catch {
        // Reader cancelled or process exited; nothing to do.
      } finally {
        markSnapshotReady()
        reader.releaseLock()
      }
    }
    void consume()
    return {
      onSnapshotReady,
      text: () =>
        new TextDecoder()
          .decode(Buffer.concat(snapshotChunks.map(c => Buffer.from(c))))
          .slice(0, SNAPSHOT_BYTES),
    }
  }

  const stdoutCollector = snapshotOf(
    child.stdout as ReadableStream<Uint8Array> | undefined,
  )
  const stderrCollector = snapshotOf(
    child.stderr as ReadableStream<Uint8Array> | undefined,
  )

  // Log a snapshot after the delay (or sooner if both snapshots are
  // already full).
  try {
    await Promise.race([
      Promise.all([
        stdoutCollector.onSnapshotReady(),
        stderrCollector.onSnapshotReady(),
      ]),
      new Promise(resolve => setTimeout(resolve, SNAPSHOT_DELAY_MS)),
    ])
    const earlyExit = await Promise.race([
      child.exited,
      new Promise<undefined>(resolve =>
        setTimeout(() => resolve(undefined), 50),
      ),
    ])
    logger.info(
      {
        command,
        args,
        pid: child.pid,
        earlyExitCode: typeof earlyExit === "number" ? earlyExit : null,
        stdoutSnapshot: stdoutCollector.text().trim() || null,
        stderrSnapshot: stderrCollector.text().trim() || null,
      },
      "moonlight-diagnostic: snapshot",
    )
  } catch (error) {
    logger.warn(
      { err: error, command, args },
      "moonlight-diagnostic: snapshot failed",
    )
  }

  // Log final exit. The continued background drain in `consume()`
  // keeps the pipes from filling while we wait.
  try {
    const exitCode = await child.exited
    logger.info(
      { command, args, pid: child.pid, exitCode },
      "moonlight-diagnostic: process exited",
    )
  } catch (error) {
    logger.warn(
      { err: error, command, args, pid: child.pid },
      "moonlight-diagnostic: failed to observe exit",
    )
  }
}

main().catch(error => {
  logger.error({ err: error }, "Failed to start Korri desktop app")
  stopDesktopServer()
  process.exit(1)
})

function pushConnectionStateToWebviews(
  state: SubscriptionRef.SubscriptionRef<ConnectionState>,
  getWindows: () => readonly BrowserWindow[],
) {
  return SubscriptionRef.changes(state).pipe(
    Stream.runForEach(snapshot =>
      Effect.sync(() => {
        const wire = toBridgeState(snapshot)
        logger.info({ status: snapshot.status }, "connection state")
        for (const window of getWindows()) {
          // `BrowserWindow.webview` is a getter that resolves the
          // associated BrowserView. `sendMessageToWebviewViaExecute`
          // wraps the payload in a call to
          // `window.__electrobun.receiveMessageFromBun(...)` and
          // executeJavascript-injects it. Failures here are not fatal
          // — the renderer falls back to `getState()` on the bridge
          // when the next event fires.
          try {
            window.webview.sendMessageToWebviewViaExecute(wire)
          } catch (error) {
            logger.warn(
              { err: error, windowTitle: window.title },
              "failed to push connection state to webview",
            )
          }
        }
      }),
    ),
  )
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
