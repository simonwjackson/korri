import {
  type LaunchResult,
  type LaunchSpec,
  launchFailureExitCode,
  type ManagedLaunchResult,
} from "@shared/library/launcher"
import {
  decodeSessiondManagedLaunchStartRequest,
  decodeSessiondManagedLaunchTerminateRequest,
  type SessiondManagedLaunchEvent,
  type SessiondManagedLaunchStartResponse,
  type SessiondManagedLaunchStatus,
  type SessiondManagedLaunchTerminateResponse,
} from "@shared/library/sessiond-managed-launch-protocol"
import { createShellLauncher } from "@shared/library/shell-launcher"
import { logger as defaultLogger } from "@shared/logger"
import {
  createElectrobunController,
  realElectrobunRunner,
} from "./sessiond-electrobun"
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
  korriSessionActiveLaunch,
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
  spawn?: (spec: LaunchSpec) => Promise<ManagedLaunchResult>
}

export interface KorriSessiondOptions {
  readonly port?: number
  readonly hostname?: string
  readonly token: string
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
  const renderer = options.renderer ?? realRendererController()
  const sway = options.sway ?? realSwayController()
  const serviceManager = options.serviceManager ?? realServiceManager()
  const launcher = options.launcher ?? createShellLauncher()
  let state: KorriSessionState = initialKorriSessionState
  let rendererPid: number | undefined
  let eventSequence = 0
  const lifecycleEvents: SessiondManagedLaunchEvent[] = []
  const lifecycleSubscribers = new Set<{
    readonly launchId: string
    readonly controller: ReadableStreamDefaultController<Uint8Array>
  }>()
  let activeManagedLaunch:
    | {
        readonly launchId: string
        cancelRequested?: "graceful" | "force"
        terminate?: () => void
        terminateNow?: () => void
      }
    | undefined

  function status(): KorriSessiondStatus {
    return {
      state,
      renderer: rendererStatus(renderer, rendererPid),
    }
  }

  function managedStatus(): SessiondManagedLaunchStatus {
    const active = korriSessionActiveLaunch(state)
    return {
      schemaVersion: 1,
      mode: state.mode,
      capabilities: {
        managedLaunch: true,
        lifecycleEvents: true,
        perLaunchTermination: typeof launcher.spawn === "function",
      },
      ...(active ? { active } : {}),
      ...(state.failureReason ? { failureReason: state.failureReason } : {}),
      restoreAttempts: state.restoreAttempts,
    }
  }

  function pushLifecycleEvent(
    launchId: string,
    input: Omit<
      SessiondManagedLaunchEvent,
      "schemaVersion" | "sequence" | "launchId" | "at"
    >,
  ) {
    const event: SessiondManagedLaunchEvent = {
      schemaVersion: 1,
      sequence: ++eventSequence,
      launchId,
      at: new Date().toISOString(),
      ...input,
    }
    lifecycleEvents.push(event)
    if (lifecycleEvents.length > 64)
      lifecycleEvents.splice(0, lifecycleEvents.length - 64)

    const encoded = sseData(event)
    for (const subscriber of lifecycleSubscribers) {
      if (subscriber.launchId === launchId)
        subscriber.controller.enqueue(encoded)
    }

    if (isTerminalLifecycleEvent(event)) closeLifecycleSubscribers(launchId)
  }

  function closeLifecycleSubscribers(launchId: string) {
    for (const subscriber of Array.from(lifecycleSubscribers)) {
      if (subscriber.launchId !== launchId) continue
      lifecycleSubscribers.delete(subscriber)
      subscriber.controller.close()
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
    if (decisions.some(decision => decision.kind === "relaunch-renderer")) {
      const launched = await renderer.launch()
      rendererPid = launched.pid
    }
    await sway.applyDecisions(
      decisions.filter(decision => decision.kind !== "relaunch-renderer"),
    )
  }

  async function startManagedLaunch(
    spec: LaunchSpec,
    requestedLaunchId?: string,
  ): Promise<{
    readonly response: SessiondManagedLaunchStartResponse
    readonly result?: Promise<LaunchResult>
  }> {
    if (state.mode !== "home") {
      return {
        response: {
          status: "failed",
          failureKind: "session-busy",
          message: `sessiond is ${state.mode}; launch requires home`,
        },
      }
    }

    const launchId = requestedLaunchId ?? crypto.randomUUID()
    state = beginKorriLaunch(state, launchId)
    activeManagedLaunch = { launchId }
    pushLifecycleEvent(launchId, { type: "launch-accepted" })

    const result = runManagedLaunch(launchId, spec)
    void result.finally(() => {
      if (activeManagedLaunch?.launchId === launchId) {
        activeManagedLaunch = undefined
      }
    })

    return { response: { status: "accepted", launchId }, result }
  }

  async function runManagedLaunch(
    launchId: string,
    spec: LaunchSpec,
  ): Promise<LaunchResult> {
    let result: LaunchResult | undefined

    try {
      await renderer.stop(rendererPid)
      rendererPid = undefined
      pushLifecycleEvent(launchId, { type: "renderer-stopped" })
      state = markKorriGameRunning(state)

      const spawn = launcher.spawn
      if (spawn) {
        const spawned = await spawn(spec)
        if (spawned.status === "failed") {
          result = spawned.result
        } else {
          const active = activeManagedLaunch
          if (active?.launchId === launchId) {
            active.terminate = spawned.session.terminate
            active.terminateNow = spawned.session.terminateNow
            if (active.cancelRequested === "force") {
              spawned.session.terminateNow()
            } else if (active.cancelRequested === "graceful") {
              spawned.session.terminate()
            }
          }
          pushLifecycleEvent(launchId, { type: "child-running" })
          result = await spawned.result
        }
      } else {
        pushLifecycleEvent(launchId, { type: "child-running" })
        result = await launcher.run(spec)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result = {
        status: "failed",
        exitCode: launchFailureExitCode("host-unavailable"),
        failureKind: "host-unavailable",
        stderrTail: message,
      }
      logger.warn({ err: error }, "sessiond: managed launch failed")
    }

    pushLifecycleEvent(launchId, {
      type: "child-exited",
      terminal: terminalFromLaunchResult(result),
    })

    state = beginKorriRestore(state)
    pushLifecycleEvent(launchId, { type: "restoring" })
    try {
      const launched = await renderer.launch()
      rendererPid = launched.pid
      state = completeKorriRestore(state)
      await reconcileHome()
      pushLifecycleEvent(launchId, {
        type: "home-ready",
        readiness: { status: "ok", evidence: "home-invariant-satisfied" },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      state = failKorriRestore(state, message)
      pushLifecycleEvent(launchId, {
        type: "recovering",
        message,
        readiness: { status: "failed", message },
      })
      logger.warn({ err: error }, "sessiond: failed to restore renderer")
      if (shouldStopAfterRestoreFailure(state)) await leaveKorri()
    }

    return result
  }

  async function launchUnderSession(spec: LaunchSpec): Promise<LaunchResult> {
    const started = await startManagedLaunch(spec)
    if (started.response.status === "failed") {
      return failedLaunchResult(started.response)
    }
    if (!started.result) {
      return {
        status: "failed",
        exitCode: launchFailureExitCode("host-unavailable"),
        failureKind: "host-unavailable",
        stderrTail: "sessiond managed launch result was not registered",
      }
    }
    return await started.result
  }

  function terminateManagedLaunchById(
    launchId: string,
    force = false,
  ): SessiondManagedLaunchTerminateResponse {
    if (activeManagedLaunch?.launchId !== launchId) {
      return {
        status: "not-found",
        launchId,
        message: "managed launch is not active",
      }
    }

    activeManagedLaunch.cancelRequested = force ? "force" : "graceful"
    if (force) {
      activeManagedLaunch.terminateNow?.()
    } else {
      activeManagedLaunch.terminate?.()
    }
    return { status: "accepted", launchId }
  }

  function lifecycleEventStream(launchId: string): Response {
    let subscriber:
      | {
          readonly launchId: string
          readonly controller: ReadableStreamDefaultController<Uint8Array>
        }
      | undefined

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const replay = lifecycleEvents.filter(
          event => event.launchId === launchId,
        )
        for (const event of replay) controller.enqueue(sseData(event))
        if (replay.some(isTerminalLifecycleEvent)) {
          controller.close()
          return
        }
        if (replay.length === 0 && activeManagedLaunch?.launchId !== launchId) {
          controller.enqueue(
            sseData({
              schemaVersion: 1,
              sequence: ++eventSequence,
              launchId,
              type: "failed",
              at: new Date().toISOString(),
              message: "managed launch event replay unavailable",
            }),
          )
          controller.close()
          return
        }
        subscriber = { launchId, controller }
        lifecycleSubscribers.add(subscriber)
      },
      cancel() {
        if (subscriber) lifecycleSubscribers.delete(subscriber)
      },
    })

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    })
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
        if (
          request.method === "GET" &&
          url.pathname === "/managed-launch/status"
        ) {
          return json(managedStatus())
        }
        if (
          request.method === "GET" &&
          url.pathname === "/managed-launch/events"
        ) {
          const launchId = url.searchParams.get("launchId")
          if (!launchId)
            return new Response("missing launchId", { status: 400 })
          return lifecycleEventStream(launchId)
        }
        if (request.method === "POST" && url.pathname === "/managed-launch") {
          const body = await decodeRequestJson(
            request,
            decodeSessiondManagedLaunchStartRequest,
          )
          if (body.status === "failed") return body.response
          const started = await startManagedLaunch(
            body.value.spec,
            body.value.launchId,
          )
          return json(started.response)
        }
        if (
          request.method === "POST" &&
          url.pathname === "/managed-launch/terminate"
        ) {
          const body = await decodeRequestJson(
            request,
            decodeSessiondManagedLaunchTerminateRequest,
          )
          if (body.status === "failed") return body.response
          return json(
            terminateManagedLaunchById(body.value.launchId, body.value.force),
          )
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

function json(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
}

async function decodeRequestJson<T>(
  request: Request,
  decode: (input: unknown) => T,
): Promise<
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "failed"; readonly response: Response }
> {
  try {
    return { status: "ok", value: decode(await request.json()) }
  } catch (error) {
    return {
      status: "failed",
      response: json(
        {
          error: "bad-request",
          message: error instanceof Error ? error.message : String(error),
        },
        { status: 400 },
      ),
    }
  }
}

function failedLaunchResult(
  response: Extract<SessiondManagedLaunchStartResponse, { status: "failed" }>,
): Extract<LaunchResult, { status: "failed" }> {
  return {
    status: "failed",
    exitCode: launchFailureExitCode(response.failureKind),
    failureKind: response.failureKind,
    stderrTail: response.message,
  }
}

function terminalFromLaunchResult(
  result: LaunchResult,
): NonNullable<SessiondManagedLaunchEvent["terminal"]> {
  if (result.status === "launched") return { exitCode: 0 }
  return {
    exitCode: result.exitCode,
    ...(result.failureKind ? { failureKind: result.failureKind } : {}),
    ...(result.stderrTail ? { stderrTail: result.stderrTail } : {}),
  }
}

function sseData(event: SessiondManagedLaunchEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

function isTerminalLifecycleEvent(event: SessiondManagedLaunchEvent): boolean {
  return ["home-ready", "failed", "recovering", "terminated"].includes(
    event.type,
  )
}

function realRendererController(): KorriRendererController {
  return createElectrobunController({
    config: {
      executablePath: process.env.KORRI_ELECTROBUN_APP,
      stateRoot: process.env.KORRI_ELECTROBUN_STATE_ROOT,
      statusFile: process.env.KORRI_ELECTROBUN_STATUS_FILE,
      logPath: process.env.KORRI_ELECTROBUN_LOG,
      sessiondUrl: process.env.KORRI_SESSIOND_URL,
      sessiondTokenFile: process.env.KORRI_SESSIOND_TOKEN_FILE,
      readinessTimeoutMs: process.env.KORRI_ELECTROBUN_READY_TIMEOUT_MS
        ? Number.parseInt(process.env.KORRI_ELECTROBUN_READY_TIMEOUT_MS, 10)
        : 10_000,
    },
    runner: realElectrobunRunner,
  })
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
