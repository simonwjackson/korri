import type { LaunchResult, LaunchSpec } from "@shared/library/launcher"
import { createShellLauncher } from "@shared/library/shell-launcher"
import { logger as defaultLogger } from "@shared/logger"
import {
  type ChromiumController,
  type ChromiumLaunchConfig,
  type ChromiumProcessRunner,
  createChromiumController,
} from "./sessiond-chromium"
import {
  type KorriRendererController,
  rendererStatus,
} from "./sessiond-renderer"
import {
  beginKorriLaunch,
  beginKorriRestore,
  completeKorriRestore,
  evaluateHomeInvariant,
  failKorriRestore,
  initialKorriSessionState,
  type KorriSessionState,
  markKorriGameRunning,
  markKorriHome,
  shouldStopAfterRestoreFailure,
  startKorriSession,
  stopKorriSession,
} from "./sessiond-state"
import {
  createSwayController,
  type SwayCommandRunner,
  type SwayController,
  type SwayWindowSelector,
} from "./sessiond-sway"

export interface KorriSessiondLogger {
  debug: (input: unknown, message?: string) => void
  info: (input: unknown, message?: string) => void
  warn: (input: unknown, message?: string) => void
  error: (input: unknown, message?: string) => void
}

export interface KorriSessiondServiceManager {
  maskEssway: () => Promise<void>
  restoreEssway: () => Promise<void>
}

export interface KorriSessiondLauncher {
  run: (spec: LaunchSpec) => Promise<LaunchResult>
}

export interface KorriSessiondOptions {
  readonly port?: number
  readonly hostname?: string
  readonly token: string
  readonly chromium?: ChromiumController
  readonly renderer?: KorriRendererController
  readonly sway?: SwayController
  readonly serviceManager?: KorriSessiondServiceManager
  readonly launcher?: KorriSessiondLauncher
  readonly logger?: KorriSessiondLogger
}

export interface KorriSessiondHandle {
  readonly port: number
  readonly hostname: string
  status: () => KorriSessiondStatus
  stop: () => Promise<void>
}

export interface KorriSessiondStatus {
  readonly state: KorriSessionState
  readonly chromiumPid?: number
  readonly renderer: ReturnType<typeof rendererStatus>
}

export interface KorriSessiondCore {
  status: () => KorriSessiondStatus
  handleRequest: (request: Request) => Promise<Response>
}

const DEFAULT_PORT = 3003
const DEFAULT_HOSTNAME = "127.0.0.1"
const TOKEN_HEADER = "x-korri-sessiond-token"

export function createKorriSessiondCore(
  options: Omit<KorriSessiondOptions, "port" | "hostname">,
): KorriSessiondCore {
  const logger = options.logger ?? defaultLogger
  const renderer =
    options.renderer ?? options.chromium ?? realChromiumController()
  const sway = options.sway ?? realSwayController()
  const serviceManager = options.serviceManager ?? realServiceManager()
  const launcher = options.launcher ?? createShellLauncher()
  let state: KorriSessionState = initialKorriSessionState
  let rendererPid: number | undefined

  function status(): KorriSessiondStatus {
    return {
      state,
      chromiumPid: renderer.kind === "chromium" ? rendererPid : undefined,
      renderer: rendererStatus(renderer, rendererPid),
    }
  }

  async function enterHome() {
    state = startKorriSession(state)
    await serviceManager.maskEssway()
    const launched = await renderer.launch()
    rendererPid = launched.pid
    state = markKorriHome(state)
    await reconcileHome()
  }

  async function leaveKorri() {
    state = stopKorriSession()
    await renderer.stop(rendererPid)
    rendererPid = undefined
    await serviceManager.restoreEssway()
  }

  async function reconcileHome() {
    const windows = await sway.getKorriWindows()
    const decisions = evaluateHomeInvariant({ windows })
    if (decisions.some(decision => decision.kind === "relaunch-chromium")) {
      const launched = await renderer.launch()
      rendererPid = launched.pid
    }
    await sway.applyDecisions(
      decisions.filter(decision => decision.kind !== "relaunch-chromium"),
    )
  }

  async function launchUnderSession(spec: LaunchSpec): Promise<LaunchResult> {
    if (state.mode !== "home") {
      return {
        status: "failed",
        exitCode: 125,
        stderrTail: `sessiond is ${state.mode}; launch requires home`,
      }
    }

    state = beginKorriLaunch(state, crypto.randomUUID())
    await renderer.stop(rendererPid)
    rendererPid = undefined
    state = markKorriGameRunning(state)

    const result = await launcher.run(spec)

    state = beginKorriRestore(state)
    try {
      const launched = await renderer.launch()
      rendererPid = launched.pid
      state = completeKorriRestore(state)
      await reconcileHome()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      state = failKorriRestore(state, message)
      logger.warn({ err: error }, "sessiond: failed to restore renderer")
      if (shouldStopAfterRestoreFailure(state)) await leaveKorri()
    }

    return result
  }

  return {
    status,
    async handleRequest(request) {
      const url = new URL(request.url)

      if (request.method === "GET" && url.pathname === "/status") {
        return json(status())
      }

      if (!authorized(request, options.token)) {
        return new Response("unauthorized", { status: 401 })
      }

      try {
        if (request.method === "POST" && url.pathname === "/control/start") {
          await enterHome()
          return json(status())
        }
        if (request.method === "POST" && url.pathname === "/control/stop") {
          await leaveKorri()
          return json(status())
        }
        if (
          request.method === "POST" &&
          url.pathname === "/control/reconcile"
        ) {
          await reconcileHome()
          return json(status())
        }
        if (request.method === "POST" && url.pathname === "/launch") {
          const body = (await request.json()) as { readonly spec?: LaunchSpec }
          if (!body.spec) return new Response("missing spec", { status: 400 })
          const result = await launchUnderSession(body.spec)
          return json({ result, ...status() })
        }
      } catch (error) {
        logger.warn(
          { err: error, path: url.pathname },
          "sessiond request failed",
        )
        return new Response(
          error instanceof Error ? error.message : String(error),
          {
            status: 500,
          },
        )
      }

      return new Response("not found", { status: 404 })
    },
  }
}

export async function startKorriSessiond(
  options: KorriSessiondOptions,
): Promise<KorriSessiondHandle> {
  const hostname = options.hostname ?? DEFAULT_HOSTNAME
  const core = createKorriSessiondCore(options)
  const server = Bun.serve({
    port: options.port ?? DEFAULT_PORT,
    hostname,
    fetch: request => core.handleRequest(request),
  })

  ;(options.logger ?? defaultLogger).info(
    { port: server.port ?? options.port ?? DEFAULT_PORT, hostname },
    "sessiond listening",
  )

  return {
    port: server.port ?? options.port ?? DEFAULT_PORT,
    hostname,
    status: core.status,
    stop: async () => {
      server.stop(true)
    },
  }
}

function authorized(request: Request, token: string): boolean {
  return request.headers.get(TOKEN_HEADER) === token
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  })
}

function realChromiumController(): ChromiumController {
  const config: ChromiumLaunchConfig = {
    executablePath: process.env.KORRI_CHROMIUM_PATH,
    profileDir: process.env.KORRI_CHROMIUM_PROFILE_DIR,
    url: process.env.KORRI_URL,
    logPath: process.env.KORRI_CHROMIUM_LOG,
    remoteDebuggingPort: process.env.KORRI_CHROMIUM_REMOTE_DEBUGGING_PORT
      ? Number.parseInt(process.env.KORRI_CHROMIUM_REMOTE_DEBUGGING_PORT, 10)
      : undefined,
  }

  const runner: ChromiumProcessRunner = {
    spawn: async command => {
      const proc = Bun.spawn([command.command, ...command.args], {
        stdout: "ignore",
        stderr: "pipe",
        env: { ...process.env },
      })
      return { pid: proc.pid }
    },
    kill: async pid => {
      try {
        process.kill(pid, "SIGTERM")
      } catch {
        // Already gone.
      }
    },
  }

  return createChromiumController({ config, runner })
}

function realSwayController(): SwayController {
  const runner: SwayCommandRunner = {
    run: async args => {
      const proc = Bun.spawn(["swaymsg", ...args], {
        stdout: "pipe",
        stderr: "pipe",
      })
      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      const exitCode = await proc.exited
      if (exitCode !== 0)
        throw new Error(stderr || `swaymsg exited ${exitCode}`)
      return stdout
    },
  }

  const selector: SwayWindowSelector = {
    appIds: envList("KORRI_SWAY_APP_IDS"),
    titles: envList("KORRI_SWAY_TITLES"),
    classes: envList("KORRI_SWAY_CLASSES"),
  }
  return createSwayController({ runner, selector })
}

function realServiceManager(): KorriSessiondServiceManager {
  return {
    async maskEssway() {
      await runSystemctl(["mask", "--runtime", "essway.service"])
      await runSystemctl(["stop", "essway.service"])
    },
    async restoreEssway() {
      await runSystemctl(["unmask", "--runtime", "essway.service"])
      await runSystemctl(["start", "essway.service"])
    },
  }
}

async function runSystemctl(args: readonly string[]) {
  const proc = Bun.spawn(["systemctl", ...args], {
    stdout: "ignore",
    stderr: "pipe",
  })
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  if (exitCode !== 0)
    throw new Error(stderr || `systemctl ${args.join(" ")} failed`)
}

function envList(name: string): readonly string[] | undefined {
  const raw = process.env[name]
  if (!raw?.trim()) return undefined
  return raw
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
}

async function main() {
  const token = process.env.KORRI_SESSIOND_TOKEN
  if (!token) throw new Error("KORRI_SESSIOND_TOKEN is required")
  const port = Number.parseInt(
    process.env.KORRI_SESSIOND_PORT ?? `${DEFAULT_PORT}`,
    10,
  )
  const handle = await startKorriSessiond({ port, token })

  const shutdown = async (signal: string) => {
    defaultLogger.info({ signal }, "sessiond shutting down")
    await handle.stop()
    process.exit(0)
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}

if (import.meta.main) {
  main().catch(error => {
    defaultLogger.error({ err: error }, "sessiond failed")
    process.exit(1)
  })
}
