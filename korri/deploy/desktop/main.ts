import { join } from "node:path"
import { logger } from "@shared/logger"
import {
  type CommandRunner,
  launchMoonlight,
} from "@app/stream/moonlight-launcher"
import { createRemoteStreamControlClient } from "@app/stream/remote-stream-client"
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
import { toBridgeState } from "./to-bridge-state"
import type { ConnectionServerRecord } from "./connection-state-bridge"
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
  const windowOptions = createDesktopWindows(
    { host: DESKTOP_HOST, port },
    profile,
    { preload: preloadPath },
  )
  windows = windowOptions.map(options => new BrowserWindow(options))

  // Re-push the latest connection state once each webview's DOM is ready.
  // This closes the race where the bun-side push happens before the
  // renderer's preload has installed `window.__korriConnection` (and
  // therefore before the override on `receiveMessageFromBun` exists).
  for (const window of windows) {
    window.webview.on("dom-ready", () => {
      const snapshot = SubscriptionRef.getUnsafe(controller.state)
      try {
        window.webview.sendMessageToWebviewViaExecute(toBridgeState(snapshot))
      } catch (error) {
        logger.warn(
          { err: error, windowTitle: window.title },
          "failed to push initial connection state on dom-ready",
        )
      }
    })
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
  run: async (command, args) => {
    try {
      const child = Bun.spawn([command, ...args], {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
      child.unref?.()
      // Fire-and-forget: drain the first 4KB from each stream within
      // 4 seconds, log it, then drop the reader (the process keeps
      // running). We don't await this — the bridge handler must return
      // quickly so the renderer's launch state can settle.
      void collectAndLogMoonlightOutput(child, command, args)
      return { status: "started" }
    } catch (error) {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

async function collectAndLogMoonlightOutput(
  child: ReturnType<typeof Bun.spawn>,
  command: string,
  args: readonly string[],
): Promise<void> {
  const LIMIT_BYTES = 4 * 1024
  const TIMEOUT_MS = 4_000

  const drain = async (
    stream: ReadableStream<Uint8Array> | undefined,
    label: "stdout" | "stderr",
  ): Promise<string> => {
    if (!stream) return ""
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    const deadline = setTimeout(() => {
      void reader.cancel().catch(() => undefined)
    }, TIMEOUT_MS)
    try {
      while (total < LIMIT_BYTES) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          total += value.byteLength
        }
      }
    } catch {
      // expected when timeout fires or process exits
    } finally {
      clearTimeout(deadline)
      reader.releaseLock()
    }
    return new TextDecoder().decode(Buffer.concat(chunks.map(c => Buffer.from(c)))).slice(0, LIMIT_BYTES)
  }

  try {
    const [stdout, stderr] = await Promise.all([
      drain(child.stdout as ReadableStream<Uint8Array> | undefined, "stdout"),
      drain(child.stderr as ReadableStream<Uint8Array> | undefined, "stderr"),
    ])
    const exited = await Promise.race([
      child.exited,
      new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 100)),
    ])
    logger.info(
      {
        command,
        args,
        pid: child.pid,
        exitCode: typeof exited === "number" ? exited : null,
        stdout: stdout.trim() || null,
        stderr: stderr.trim() || null,
      },
      "moonlight-diagnostic: process output",
    )
  } catch (error) {
    logger.warn(
      { err: error, command, args },
      "moonlight-diagnostic: failed to capture output",
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
